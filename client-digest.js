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
const { detectTextLang } = require('./lang-id'); // (CORRECTIVO-9) identificador de idioma positivo, determinístico
const personalizacion = require('./personalizacion'); // (LOTE PERSONALIZACIÓN 6/11) voz + logo

const DIGEST_VERSION = 1;

// ---------- texto ----------
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// (LOTE LÍNEAS-ROJAS-TITULAR · 7/11) Las líneas rojas (q8) son una
// RESTRICCIÓN, nunca contenido. Su etiqueta («LÍNEAS ROJAS — NUNCA
// PUBLICAR: ...») viajaba en el richGoal al form del digest y el
// minador la partía en «LÍNEAS ROJAS» como si fuera un servicio;
// deriveTopics la convertía en titular («LÍNEAS ROJAS», lunes de
// Top Class, grabación 7/11). Estas ayudas detectan la etiqueta en
// cualquier forma (ES/EN, con o sin acento) y los términos del dueño.
function isVetoLabelText(s) {
  const n = norm(s || '');
  if (!n) return false;
  if (n.includes('lineas rojas') || n.includes('red lines')) return true;
  if (/^(nunca publicar|never post)\b/.test(n)) return true;
  return false;
}
function vetoTermsFromOnboarding(onboarding) {
  const raw = (onboarding && onboarding.lineas_rojas) || '';
  return String(raw).split(/[,;]+/).map((t) => norm(t)).filter((t) => t.length >= 3);
}
function isVetoText(s, onboarding) {
  const n = norm(s || '');
  if (!n) return false;
  if (isVetoLabelText(s)) return true;
  for (const t of vetoTermsFromOnboarding(onboarding)) {
    if (!t) continue;
    if (n.includes(t)) return true;
    if (n.length >= 8 && t.includes(n)) return true;
  }
  return false;
}
// Saca del texto las líneas de vetos («LÍNEAS ROJAS — NUNCA PUBLICAR:
// ...»): el goal no ordena temas con ellas ni las cita en captions.
function stripVetoLines(text) {
  return String(text || '').split(/\r?\n/).filter((l) => !isVetoLabelText(l)).join('\n');
}
// Última puerta sobre temas ya derivados: saca cualquier tema cuyo
// titular, tema o ancla sea la etiqueta o un término vetado del dueño.
// Cubre digest ya envenenados (sembrados antes del fix).
function dropVetoTopics(topics, onboarding) {
  if (!Array.isArray(topics)) return topics;
  return topics.filter((t) => {
    if (!t) return false;
    const hay = [t.headline, t.tema, t.digest_anchor].map((x) => String(x || ''));
    return !hay.some((x) => isVetoText(x, onboarding));
  });
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
  // (M3 FICHA-OFERTA) Los números de la ficha también son verdad del
  // digest: un precio de la ficha pasa el candado de promo.
  if (digest.offerSheet) {
    pushItems(digest.offerSheet.productos, ['nombre', 'precio']);
    pushItems(digest.offerSheet.precios, ['precio', 'contexto']);
    pushItems(digest.offerSheet.promos, ['titulo', 'descuento']);
  }
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
function pieceAnchored(text, anchors, opts) {
  if (!Array.isArray(anchors) || !anchors.length) return { ok: false, anchor: null, reason: 'sin_anclas' };
  const t = norm(text);
  if (!t) return { ok: false, anchor: null, reason: 'sin_texto' };
  const words = textWordSet(text);
  // (LOTE CORRECTIVO-8 · ESTRELLA-CON-EVIDENCIA) Modo strictPhrase:
  // para CONTAR MENCIONES como evidencia, una ancla de 2+ palabras
  // exige la FRASE COMPLETA en el texto crudo — una sola palabra
  // suelta («model»/«photo» en las líneas de créditos) no es una
  // mención del producto. El modo por defecto (pertenencia de piezas:
  // generador/demo/reel, con apodos del léxico y segmentos del
  // diferencial) conserva su contrato histórico frase-O-palabra.
  const strict = !!(opts && opts.strictPhrase);
  for (const a of anchors) {
    const multiWord = !!(a.phrase && a.phrase.split(' ').length >= 2);
    if (multiWord && t.includes(a.phrase)) return { ok: true, anchor: a.text };
    if (strict && multiWord) continue;
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
 * star_source='sales' marca que la estrella es medición, no lectura.
 * (LOTE L3) La confirmada por el dueño solo manda si CALZA con lo
 * evidenciado (duenoStarEvidenceMatch, abajo): una respuesta genérica
 * sin calce («proyecto», Veja 12/11) se trata como NO declarada. */
function effectiveStarOf(digest) {
  if (!digest || typeof digest !== 'object') return null;
  const duenoStar = digest.dueno && digest.dueno.estrella;
  if (duenoStar) {
    const matched = duenoStarEvidenceMatch(digest, duenoStar);
    if (matched) return { item: matched, source: 'dueno', evidence: [] };
  }
  const inf = digest.inferred_star;
  if (inf && inf.item && inf.fuente === 'dueno') {
    // (LOTE CORRECTIVO-4) La confirmación guardada como inferida del
    // dueño (Posty pregunta) pasa la MISMA validación que la
    // declaración: sin calce con evidencia de nombre propio no manda
    // — un genérico confirmado por error («cafe») cae a ventas o a la
    // inferida, nunca corona. Era la vía por la que el demo guardaba
    // la estrella sin pasar el filtro L3.
    const matchedD = duenoStarEvidenceMatch(digest, inf.item);
    if (matchedD) return { item: matchedD, source: 'dueno', evidence: (Array.isArray(inf.evidence) ? inf.evidence : []).map(String) };
  }
  const tn = tnBlockOf(digest);
  if (tn && tn.star && tn.star.name && (tn.star.units_30d || 0) > 0) {
    const u = tn.star.units_30d;
    return {
      item: String(tn.star.name), source: 'sales', units_30d: u,
      evidence: [`vendió ${u} unidades en los últimos 30 días (ventas reales de su Tiendanube)`],
    };
  }
  // (LOTE INGESTA) Defensa en profundidad para digests sembrados ANTES
  // del fix: la inferida que es un rótulo de cromo («Customer Services»,
  // «Dirty Soda Value Menu») tampoco es estrella. La medida por ventas
  // reales (Tiendanube) no se toca: es medición, no inferencia del
  // picker. (LOTE L3) La confirmada por el dueño YA no es ciega: se
  // validó arriba contra lo evidenciado; sin calce cae acá (inferida
  // o null) y nunca manda un genérico sin evidencia.
  if (inf && inf.item && (inf.confidence || 0) >= 0.5 && !isGenericCategoryName(inf.item) && !isChromeDerivedName(inf.item) && !isCreditRoleName(inf.item) && starNamedEvidenceOk(digest, inf.item)) {
    return { item: String(inf.item), source: 'inferred', evidence: (Array.isArray(inf.evidence) ? inf.evidence : []).map(String) };
  }
  return null;
}

/* (LOTE L3 — la estrella del dueño se VALIDA) La declaración del dueño
 * en el formulario solo manda si CALZA con lo evidenciado del negocio:
 * algún producto o servicio del digest, o de sus ventas reales
 * (Tiendanube), cuyo nombre coincida (a) por nombre — sameItemName —,
 * (b) por frase contenida (la respuesta nombra el ítem dentro de una
 * frase más larga, o el ítem contiene la respuesta), o (c) porque
 * todas las palabras distintivas del ítem aparecen en la respuesta.
 * Devuelve el nombre EVIDENCIADO (canónico, el del digest) o ''.
 * · Los rótulos de cromo no son evidencia de producto: un «Customer
 *   Services» sembrado en un digest viejo no valida nada.
 * · Lo SIN STOCK tampoco valida: promocionarlo es vender lo que no hay.
 * Sin calce, la declaración se trata como NO declarada: manda la
 * inferida (o las ventas) y, si no hay, null. La estrella del dueño
 * que SÍ calza se respeta como antes (primera señal).
 * LÍMITE HONESTO: si el digest mismo trae un rótulo de sección como
 * producto (el menú-cuerpo de Veja, L5), un calce exacto con él
 * valida; la puerta que lo saca del digest es el strip (L5), no esta. */
function duenoStarEvidenceMatch(digest, starName) {
  const s = String(starName || '').trim();
  if (!s) return '';
  const cands = [];
  for (const list of [digest && digest.productos, digest && digest.servicios]) {
    for (const it of (list || [])) {
      const n = cleanOfferName(it);
      if (n) cands.push(n);
    }
  }
  const tn = tnBlockOf(digest);
  if (tn) {
    if (tn.star && tn.star.name) cands.push(String(tn.star.name));
    for (const t of (tn.top_sellers || [])) if (t && t.name) cands.push(String(t.name));
  }
  const oos = tnOutOfStockNames(digest);
  const starWords = textWordSet(s);
  const ns = ' ' + norm(s) + ' ';
  for (const cand of cands) {
    const c = cleanOfferName(cand);
    if (!c) continue;
    if (isChromeDerivedName(c)) continue;
    // (LOTE CORRECTIVO-4) Una CATEGORÍA jamás es evidencia de
    // estrella: el agujero de Hungry Ghost era que el digest trajera
    // «cafe» como ítem y la declaración genérica del dueño «calzara»
    // contra él — la validación validaba un genérico porque la
    // evidencia era genérica. Ítem de tipo/línea = tema, nunca
    // evidencia. La excepción es la palabra de GÉNERO sola (pin D4
    // v924: dueño «HOMME» con «HOMME» en productos manda): género no
    // es categoría — es la etiqueta del ítem que el dueño nombró —
    // y la inferida de género sigue rechazada en su rama.
    if (isGenericCategoryName(c) && !isGenderOnlyName(c)) continue;
    if (oos.length && tnNameMatch(c, oos)) continue;
    // (LOTE CORRECTIVO-4) Y el calce difuso exige evidencia de
    // NOMBRE PROPIO (starNamedEvidenceOk): con productos_nombrados
    // en el digest, el candidato tiene que ser un producto/modelo
    // evidenciado (o un nombre real de su Tiendanube). Lo minado de
    // prosa no valida una estrella. El calce EXACTO literal contra
    // un ítem de productos/servicios no pasa por esta exigencia: es
    // la palabra del dueño sobre un ítem que el digest ya trae como
    // producto (la doctrina del pin D4).
    if (norm(c) !== norm(s) && Array.isArray(digest.productos_nombrados) && !starNamedEvidenceOk(digest, c)) continue;
    if (sameItemName(c, s)) return c;
    const nc = norm(c);
    if (nc.length >= 2 && (ns.includes(' ' + nc + ' ') || (' ' + nc + ' ').includes(ns))) return c;
    const dw = distinctiveWords(c);
    if (dw.length && dw.every((w) => { for (const f of wordForms(w)) if (starWords.has(f)) return true; return false; })) return c;
  }
  return '';
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
const OFFER_SECOND_PERSON = new Set(['tu', 'tus', 'vos', 'te', 'ti', 'contigo', 'tuyo', 'tuya', 'tuyos', 'tuyas', 'your']);
/* (LOTE PLACEHOLDER-COPY) Chrome de tienda (Shopify y genérico):
 * rótulos del selector de país/moneda, del carrito, de la cuenta y
 * de secciones de la tienda. Ninguna de estas frases es algo que el
 * negocio venda — en Ladyee llegaron como «productos» al digest y de
 * ahí al picker («Country/region and currency» en las 3 tarjetas), al
 * título del reel y a los captions («3 claves de your bag»). Se
 * chequea sobre el nombre normalizado (sin acentos, minúsculas). */
const OFFER_STORE_CHROME = ['country/region', 'country region', 'your bag', 'shopping bag', 'shopping cart', 'my cart', 'my account', 'my wishlist', 'new arrivals', 'shop all', 'shop now', 'wishlist', 'track your order', 'track order', 'join our tribe', 'sign in', 'log in', 'sign up', 'filter by', 'sort by'];
/* (JULI · 2026-11-07 — ids 571/573, Portrait Coffee, generados 7/11
 * DESPUÉS de v751) Rótulos en inglés de colección/menú que NO son
 * chrome de tienda y por eso pasaban la puerta: «Best Sellers» es el
 * nombre de una colección, «single origin coffees» el rótulo en inglés
 * del menú — en los captions en español salen «Best Sellers, otro
 * favorito de Portrait Coffee» y «3 claves para elegir bien en single
 * origin coffees». Se rechazan por FRASE, no por palabra suelta: un
 * «Single malt» real sigue pasando. Préstamos reales del rubro
 * («latte», «flat white», «espresso», «barista», «brunch», «makeup»)
 * no están en la lista y siguen pasando. */
const OFFER_ENGLISH_LABELS = ['best sellers', 'best seller', 'single origin', 'origin coffees'];
const OFFER_2P_VERBS = new Set(['aprende', 'aprendes', 'aprobas', 'aproba', 'descubre', 'descubri', 'empeza', 'empezas', 'mira', 'miras', 'suma', 'sumas', 'sumate', 'uni', 'unis', 'unite', 'gana', 'ganas', 'ahorra', 'ahorras', 'crece', 'creces', 'ordena', 'ordenas', 'organiza', 'organizas', 'delega', 'delegas', 'vende', 'vendes', 'elegi', 'elegis', 'elegilo', 'hace', 'haces', 'hacelo', 'tene', 'tenes', 'pode', 'podes', 'quere', 'queres', 'senti', 'sentis', 'pensa', 'pensas', 'cree', 'crees', 'segui', 'seguis', 'veni', 'venis', 'abri', 'abris', 'cerra', 'cerras', 'entra', 'entras', 'sali', 'salis', 'dormi', 'dormis', 'rei', 'reis']);
/* (LOTE ESTRELLA-MODELO-REAL · v924 — caso Veja, 11/11) Categoría, no
 * modelo: el posteo de Veja dijo «HOMME». «Homme» es francés para
 * «hombre»: la categoría de la tienda (su nav: HOMME / FEMME), no un
 * modelo. Los modelos reales de Veja son Esplar, Campo, V-10. Ninguna
 * puerta lo frenó: NAV_JUNK_H rechaza «menú» pero no «homme», y la
 * puerta de admisión no conocía palabras de género. Dos niveles:
 * · GÉNERO (puerta): una palabra de género —o una etiqueta hecha solo
 * de palabras de género— nombra A QUIÉN, no QUÉ se vende: jamás es un
 * ítem de oferta. «Corte hombre» pasa (corte no es género); «Homme»,
 * «Para hombre», «Men» no pasan.
 * · TIPO GENÉRICO (solo estrella): «zapatillas», «perfume», «café»
 * son cosas que el negocio vende, pero no un modelo con nombre: pueden
 * ser tema, nunca estrella. «Campo» NO está en la lista: es un modelo
 * real de Veja y la regla lo protege por nombre. */
const OFFER_GENDER_NOUNS = new Set(['hombre', 'hombres', 'mujer', 'mujeres', 'homme', 'hommes', 'femme', 'femmes', 'man', 'men', 'woman', 'women', 'male', 'female', 'nino', 'ninos', 'nina', 'ninas', 'enfant', 'enfants', 'kid', 'kids', 'baby', 'babies', 'bebe', 'bebes', 'unisex', 'adulto', 'adultos', 'adult', 'adults']);
const STAR_GENERIC_TYPE_NOUNS = new Set(['zapatilla', 'zapatillas', 'zapato', 'zapatos', 'calzado', 'sneaker', 'sneakers', 'tenis', 'bota', 'botas', 'sandalia', 'sandalias', 'shoe', 'shoes', 'boot', 'boots', 'sandal', 'sandals', 'perfume', 'perfumes', 'colonia', 'colonias', 'cologne', 'fragancia', 'fragancias', 'fragrance', 'fragrances', 'cafe', 'cafes', 'coffee', 'coffees', 'te', 'tea', 'ropa', 'indumentaria', 'clothing', 'apparel', 'vestido', 'vestidos', 'dress', 'dresses', 'camisa', 'camisas', 'shirt', 'shirts', 'remera', 'remeras', 'pantalon', 'pantalones', 'pants', 'jeans', 'bolso', 'bolsos', 'bolsa', 'bolsas', 'bag', 'bags', 'cartera', 'carteras', 'purse', 'mochila', 'mochilas', 'backpack', 'joya', 'joyas', 'jewelry', 'jewel', 'anillo', 'anillos', 'ring', 'rings', 'collar', 'collares', 'necklace', 'reloj', 'relojes', 'watch', 'watches', 'crema', 'cremas', 'cream', 'serum', 'maquillaje', 'makeup', 'labial', 'lipstick', 'esmalte', 'polish', 'shampoo', 'jabon', 'soap', 'vela', 'velas', 'candle', 'candles', 'flor', 'flores', 'flower', 'flowers', 'pan', 'bread', 'torta', 'pastel', 'cake', 'helado', 'pizza', 'cerveza', 'beer', 'vino', 'wine', 'chocolate', 'galleta', 'galletas', 'cookie', 'cookies']);
/* (LOTE CORRECTIVO-4 · ESTRELLA-CON-NOMBRE — caso Veja 12/11)
 * Palabras de LÍNEA/actividad y de proyecto: nombran la línea del
 * negocio («Running» es la línea de running de Veja, no un modelo
 * como Esplar/V-10/Campo) o su proyecto («proyecto»); jamás son
 * estrella. Se suman al set de composición (isGenericCategoryName).
 * La composición TODAS-las-palabras protege los nombres mixtos
 * («Trail Glove» pasa: glove no es genérico). La puerta de fondo no
 * es esta lista — estructuralmente porosa para líneas en otro idioma
 * — sino la evidencia de nombre propio: extractNamedProducts /
 * starNamedEvidenceOk (más abajo). */
for (const _lw of ['running', 'training', 'racing', 'trail', 'performance', 'sport', 'sports', 'deporte', 'deportes', 'fitness', 'gym', 'yoga', 'pilates', 'cycling', 'ciclismo', 'swimming', 'natacion', 'proyecto', 'proyectos', 'project', 'projects', 'projet', 'projets', 'linea', 'line', 'coleccion', 'collection', 'pastry', 'pastries']) STAR_GENERIC_TYPE_NOUNS.add(_lw);
const STAR_GENERIC_STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'para', 'por', 'a', 'the', 'for', 'pour', 'le', 'les', 'des', 'di', 'da', 'en', 'y', 'and', 'et', 'con', 'with', 'avec']);
/* ¿El nombre es solo categoría (género y/o tipo genérico), sin ningún
 * nombre propio de modelo? La regla es TODAS las palabras de contenido:
 * «Mint Mojito» pasa (mojito no es genérico); «Té Verde» pasa (verde no
 * es genérico); «Zapatillas Hombre» no pasa; «Café» no pasa. Un nombre
 * de UNA palabra que es un modelo real («Esplar», «Campo», «Tesora»,
 * «V-10») nunca está en estas listas y pasa siempre. */
function isGenericCategoryName(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  const words = norm(s).split(' ').filter(Boolean).filter((w) => !STAR_GENERIC_STOPWORDS.has(w));
  if (!words.length) return true;
  return words.every((w) => OFFER_GENDER_NOUNS.has(w) || STAR_GENERIC_TYPE_NOUNS.has(w));
}
function isGenderOnlyName(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  const words = norm(s).split(' ').filter(Boolean).filter((w) => !STAR_GENERIC_STOPWORDS.has(w));
  if (!words.length) return false;
  return words.every((w) => OFFER_GENDER_NOUNS.has(w));
}
/* (LOTE CORRECTIVO-4 · ESTRELLA-CON-NOMBRE) PRODUCTOS CON NOMBRE —
 * la causa raíz de la estrella genérica (Hungry Ghost/Veja, 12/11):
 * la extracción del digest solo levantaba ítems de nivel categoría
 * (del sitio/servicios) y NINGÚN producto con nombre del feed:
 * «Fresh Good Batch» estaba en las captions y no aparecía en ninguna
 * salida; la validación calzaba entonces contra ese material flojo y
 * «validaba» el genérico. Este extractor levanta candidatos a
 * producto CON NOMBRE y su evidencia:
 * · de las captions del feed: frases en Title Case (2–4 palabras),
 *   nombres entre comillas, códigos de modelo (V-10) y palabras
 *   capitalizadas a mitad de oración o repetidas (nombre propio);
 * · de los ítems ya leídos con fuente fuerte (ADN del dueño, catálogo
 *   web/PDF, link de bio, home): su nombre, si es nombre propio de
 *   producto (no categoría, no cromo, no género).
 * Lo minado de prosa (bio/form) NO es evidencia de nombre: no entra.
 * El digest guarda la lista en productos_nombrados [{nombre, fuente,
 * menciones}] y la estrella — venga del dueño, del digest o del
 * demo — exige calzar con ella (starNamedEvidenceOk). */
const NAMED_TOKEN_STOP = new Set(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'navidad', 'christmas', 'halloween', 'verano', 'invierno', 'primavera', 'otono', 'summer', 'winter', 'spring', 'autumn', 'fall', 'gracias', 'thanks', 'thank', 'hola', 'hello', 'feliz', 'happy', 'bienvenidos', 'bienvenidas', 'welcome']);
/* (LOTE CORRECTIVO-8 · ESTRELLA-CON-EVIDENCIA — la puerta circular,
 * Veja #5, 13/11) RÓTULOS DE ROL DE CRÉDITOS: las captions cierran con
 * líneas de créditos («Model: @x Photo: @y», «Ph:», «Foto:») y el
 * minero, al pelar las menciones, dejaba los rótulos adyacentes como
 * un «producto» («Model Photo», coronado estrella con la puerta de
 * correctivo-4 validando contra la lista del propio minero). Un
 * rótulo de rol NUNCA es nombre de producto: ni solo («Model»,
 * «Foto») ni combinado («Model Photo», «Photo Credits»). Un nombre
 * con alguna palabra que NO es rótulo pasa («Model 3»: el 3 no es
 * rótulo; «Model Bakery»: bakery no es rótulo). */
const CREDIT_ROLE_LABELS = new Set(['model', 'models', 'modelo', 'modelos',
  'photo', 'photos', 'foto', 'fotos', 'photographer', 'photographers',
  'fotografo', 'fotografos', 'fotografa', 'fotografas', 'photography',
  'fotografia', 'ph', 'video', 'videos', 'videographer', 'styling',
  'stylist', 'estilismo', 'makeup', 'maquillaje', 'mua', 'hair',
  'credits', 'creditos', 'credito', 'wardrobe', 'vestuario',
  'production', 'produccion', 'direction', 'direccion', 'camera', 'camara']);
function isCreditRoleName(raw) {
  const words = norm(raw).split(' ').filter((w) => w && !STAR_GENERIC_STOPWORDS.has(w));
  if (!words.length) return false;
  return words.every((w) => CREDIT_ROLE_LABELS.has(w));
}
/* Pela los BLOQUES DE CRÉDITOS de una caption antes de minar: todo lo
 * que sigue a un rótulo de rol con «:» en una línea es crédito, no
 * contenido de la marca («…Brasil Photos: @…», «Model: @x Photo: @y»).
 * Lo que precede al primer rótulo en la línea se conserva. */
const CREDIT_LABEL_RE = new RegExp('\\b(' + [...CREDIT_ROLE_LABELS].join('|') + ')\\s*:', 'i');
function stripCaptionCredits(text) {
  return String(text || '').split('\n').map((line) => {
    const m = CREDIT_LABEL_RE.exec(line);
    return m ? line.slice(0, m.index) : line;
  }).join('\n');
}
/* ¿La FRASE COMPLETA del nombre está en el texto crudo? (borde de
 * palabra sobre el texto normalizado: las menciones @… del crudo
 * quedan como tokens y rompen la contigüidad — «Model Photo» no
 * existe como frase en ningún crudo de Veja.) */
function phraseInRawText(nombre, text) {
  const p = norm(nombre);
  if (!p) return false;
  return (' ' + norm(text) + ' ').includes(' ' + p + ' ');
}
/* ¿El nombre es SUJETO de alguna oración del crudo? La marca lo
 * presenta como sujeto («The Salar, where…», «Meet The Atlas in
 * hairy suede.»): la frase abre la oración, con artículo inicial o
 * tras un verbo de presentación de una lista cerrada. Es la señal
 * editorial que distingue un modelo real de un fragmento minado. */
const SUBJECT_INTRO_VERBS = new Set(['meet', 'discover', 'presenting', 'introducing',
  'try', 'shop', 'get', 'conoce', 'descubri', 'proba', 'mira', 'presentamos', 'llega']);
const LEADING_ARTICLE_RE = /^(the|a|an|el|la|los|las|un|una) /;
function phraseSubjectInCaption(nombre, caption) {
  const target = norm(nombre);
  if (!target) return false;
  for (const sent of String(caption || '').split(/[.!?…\n]+/)) {
    const ns = norm(sent);
    if (!ns) continue;
    if (ns === target || ns.startsWith(target + ' ')) return true;
    const noArt = ns.replace(LEADING_ARTICLE_RE, '');
    if (noArt === target || noArt.startsWith(target + ' ')) return true;
    const first = noArt.split(' ')[0];
    if (SUBJECT_INTRO_VERBS.has(first)) {
      const rest = noArt.slice(first.length + 1).replace(LEADING_ARTICLE_RE, '');
      if (rest === target || rest.startsWith(target + ' ')) return true;
    }
  }
  return false;
}
/* ¿El nombre puede ser un producto CON NOMBRE? Nombre propio de
 * producto/modelo: plausible como oferta, NO categoría (composición),
 * NO cromo de sección, NO solo género, ≤4 palabras. «Tesora»,
 * «Esplar», «V-10», «Mint Mojito», «Fresh Good Batch» pasan; «cafe»,
 * «running», «proyecto» no. */
function namedProductOk(raw) {
  const s = cleanOfferName(raw);
  if (!s) return '';
  if (s.length < 3 || s.length > 48) return '';
  if (s.split(/\s+/).filter(Boolean).length > 4) return '';
  if (!isPlausibleOfferItem(s)) return '';
  if (isGenericCategoryName(s) || isChromeDerivedName(s) || isGenderOnlyName(s)) return '';
  // (LOTE CORRECTIVO-8) Un rótulo de rol de créditos no es producto,
  // ni solo ni combinado («Model Photo»): la admisión lo veta acá,
  // para candidatos de caption y para ítems por igual.
  if (isCreditRoleName(s)) return '';
  return s;
}
function captionNamedCandidates(captions) {
  const byNorm = new Map();
  const add = (rawName, capIdx, strong) => {
    const nombre = namedProductOk(rawName);
    if (!nombre) return;
    if (NAMED_TOKEN_STOP.has(norm(nombre).split(' ')[0])) return;
    const k = norm(nombre);
    let e = byNorm.get(k);
    if (!e) { e = { nombre, caps: new Set(), strong: false }; byNorm.set(k, e); }
    e.caps.add(capIdx);
    if (strong) e.strong = true;
  };
  (captions || []).slice(0, 30).forEach((cap, ci) => {
    // (LOTE CORRECTIVO-8) Los créditos se pelan ANTES de minar (y
    // antes de pelar las menciones): «Model: @x Photo: @y» ya no
    // puede dejar los rótulos adyacentes como candidato.
    const text = stripCaptionCredits(String(cap || '')).replace(/https?:\/\/\S+/g, ' ').replace(/[#@][\w.]+/g, ' ');
    for (const m of text.matchAll(/[«"“]([^»"”]{3,40})[»"”]/g)) add(m[1], ci, true);
    for (const sent of text.split(/[.!?…\n]+/)) {
      const toks = sent.split(/\s+/)
        .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, ''))
        .filter(Boolean);
      const isCap = toks.map((t) => t.length >= 2 && /^[A-ZÁÉÍÓÚÑ]/.test(t));
      const isConn = toks.map((t) => /^(de|la|el|los|las|the|of|&|con|y|and|·|-)$/i.test(t));
      let i = 0;
      while (i < toks.length) {
        if (!isCap[i]) { i++; continue; }
        let j = i;
        const run = [toks[i]];
        while (j + 1 < toks.length) {
          if (isCap[j + 1]) { run.push(toks[j + 1]); j++; continue; }
          if (isConn[j + 1] && j + 2 < toks.length && isCap[j + 2]) { run.push(toks[j + 1], toks[j + 2]); j += 2; continue; }
          break;
        }
        const capCount = run.filter((t) => /^[A-ZÁÉÍÓÚÑ]/.test(t)).length;
        const nombre = run.join(' ');
        // Fuerte: frase de 2+ palabras capitalizadas, código de
        // modelo (dígito/guion: V-10) o capitalizada a mitad de
        // oración (nombre propio). Suelta al inicio de oración y una
        // sola vez: puede ser cualquier apertura — no alcanza.
        const strong = capCount >= 2 || /\d/.test(nombre) || /-/.test(nombre) || i > 0;
        add(nombre, ci, strong);
        // (LOTE CORRECTIVO-8) Si la corrida abre con un verbo de
        // presentación («Meet The Atlas in hairy suede»), el nombre
        // del producto es la corrida SIN el verbo: candidato propio.
        // Era la vía del tip roto «meet the atlas» (la apertura de
        // la caption minada como si fuera el producto).
        const runToks = nombre.split(' ');
        if (runToks.length >= 2 && SUBJECT_INTRO_VERBS.has(norm(runToks[0]))) {
          add(runToks.slice(1).join(' '), ci, strong);
        }
        i = j + 1;
      }
    }
  });
  const out = [];
  for (const e of byNorm.values()) {
    if (e.strong || e.caps.size >= 2) out.push({ nombre: e.nombre, menciones: e.caps.size });
  }
  return out;
}
/* (LOTE CORRECTIVO-8) Fuentes que son superficie externa del
 * negocio (su tienda, su web, su link de bio): la clase 'catalogo'. */
const NAMED_STRONG_FUENTES = new Set(['web', 'web-catalog', 'bio-link', 'catalogo', 'pdf', 'home']);
function extractNamedProducts({ captions, items, business, handle } = {}) {
  const caps = Array.isArray(captions) ? captions : [];
  // (LOTE CORRECTIVO-8) La mención que cuenta como evidencia es la
  // FRASE COMPLETA en el texto crudo (pieceAnchored estricto): una
  // palabra suelta ya no suma menciones a ningún candidato.
  const mentionCount = (nombre) => {
    const anchors = anchorsFromTexts([nombre]);
    let n = 0;
    for (const c of caps.slice(0, 20)) if (pieceAnchored(String(c || ''), anchors, { strictPhrase: true }).ok) n++;
    return n;
  };
  /* Clases de evidencia INDEPENDIENTES del candidato (la
   * corroboración cruzada de la puerta nueva): 'sujeto' (frase-sujeto
   * en el crudo), 'repetida' (frase completa en 2+ captions),
   * 'frase' (frase completa en 1+), 'catalogo' (superficie externa),
   * 'dueno' (su ADN). 'frase' sola nunca corrobora: es la señal que
   * el artefacto de créditos simulaba con palabras sueltas. */
  const clasesFor = (nombre, fuente) => {
    const cl = [];
    const m = mentionCount(nombre);
    if (m >= 1) cl.push('frase');
    if (m >= 2) cl.push('repetida');
    if (caps.slice(0, 20).some((c) => phraseSubjectInCaption(nombre, String(c || '')))) cl.push('sujeto');
    if (fuente === 'dna') cl.push('dueno');
    else if (NAMED_STRONG_FUENTES.has(fuente)) cl.push('catalogo');
    return cl;
  };
  const out = [];
  const seen = new Map();
  const push = (nombre, fuente, menciones, clases) => {
    const k = norm(nombre);
    const prev = seen.get(k);
    if (prev) {
      if ((menciones || 0) > prev.menciones) prev.menciones = menciones || 0;
      if (Array.isArray(clases)) for (const c of clases) if (!prev.clases.includes(c)) prev.clases.push(c);
      return;
    }
    const e = { nombre, fuente, menciones: menciones || 0, clases: Array.isArray(clases) ? [...clases] : [] };
    seen.set(k, e);
    out.push(e);
  };
  for (const it of (items || [])) {
    const nombre = namedProductOk(it && (it.nombre || it));
    if (!nombre) continue;
    if (business && sameItemName(nombre, business)) continue;
    const fuente = (it && it.fuente) || 'catalogo';
    push(nombre, fuente, mentionCount(nombre), clasesFor(nombre, fuente));
  }
  for (const cand of captionNamedCandidates(caps)) {
    if (business && sameItemName(cand.nombre, business)) continue;
    if (handle && norm(cand.nombre) === norm(handle)) continue;
    push(cand.nombre, 'caption', Math.max(cand.menciones, mentionCount(cand.nombre)), clasesFor(cand.nombre, 'caption'));
  }
  out.sort((a, b) => (b.menciones - a.menciones));
  return out.slice(0, 12);
}
/* (LOTE CORRECTIVO-8) ¿Una entrada de productos_nombrados está
 * CORROBORADA? La puerta de correctivo-4 validaba la estrella contra
 * la lista que produjo el propio minero: circular — el artefacto
 * «Model Photo» era el ítem N.º 1 de su propia evidencia. Ahora una
 * entrada nacida SOLO de las captions necesita DOS señales
 * independientes entre {sujeto, repetida, catalogo, dueno}, donde
 * 'catalogo'/'dueno' con la frase presente en el feed ('frase')
 * suman la segunda señal (dos superficies que coinciden). 'frase'
 * sola — la señal que los créditos simulaban — nunca corrobora.
 * · Entrada con respaldo de fuente fuerte (fuente ≠ 'caption'):
 *   corrobora como siempre (es la superficie externa misma).
 * · Entrada legada sin `clases` (digest guardado antes de este
 *   lote): manda la fuente — la de caption sola era justamente la
 *   lista circular y no corrobora. */
function namedEntryCorroborated(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!Array.isArray(entry.clases)) return entry.fuente !== 'caption';
  const c = new Set(entry.clases);
  let n = 0;
  if (c.has('sujeto')) n++;
  if (c.has('repetida')) n++;
  if (c.has('catalogo')) n++;
  if (c.has('dueno')) n++;
  if ((c.has('catalogo') || c.has('dueno')) && c.has('frase')) n++;
  return n >= 2;
}
/* La misma evidencia para CUALQUIER ítem que un posteo afirme como
 * producto (no solo la estrella): un ítem del digest que calza con
 * una entrada de productos_nombrados nacida solo de captions exige
 * la corroboración de esa entrada; el resto de los ítems (fuente
 * fuerte, o sin entrada porque no son «nombrados») pasa como hoy. */
function namedItemCorroborated(digest, name) {
  if (!digest || !Array.isArray(digest.productos_nombrados)) return true;
  const matches = digest.productos_nombrados.filter((x) => x && sameItemName(String(x.nombre || x), String(name || '')));
  if (!matches.length) return true;
  return matches.some((e) => (e && e.fuente !== 'caption') || namedEntryCorroborated(e));
}
/* (LOTE ILUSTRADA-BAJO-LA-VARA · pieza 8) ¿Este ítem tiene evidencia
 * de PRODUCTO (cosa vendible fotografiable), no de servicio? La
 * familia de servicios sale del RUBRO, pero no puede narrar como
 * servicio a un ítem que el propio fundamento evidencia como
 * producto: la corrida The Ordinary (13/11) narró «The Holiday
 * Bundle» — un pack de productos de su tienda — como «another
 * service… we'll reply with a clear proposal» y coronó el slot 0 con
 * la plantilla de reserva «Book … today». Evidencia de producto:
 * · una FOTO REAL mapeada a este ítem en el photo_map (foto↔producto
 *   con marca), o
 * · una entrada de productos_nombrados del CATÁLOGO de su tienda
 *   (clase 'catalogo' con fuente de catálogo: 'catalogo',
 *   'web-catalog' o 'bio-link' — la tienda vende cosas; la lista
 *   genérica de la web, fuente 'web', mezcla productos y servicios
 *   y NO discrimina: un «Corte y peinado» listado en la web de la
 *   peluquería no es un producto por estar listado).
 * Sin ninguna de las dos, el ítem se narra como lo diga su familia:
 * un servicio puro de un rubro de servicios no gana evidencia de
 * producto por estar en la lista mezclada de la web (v348 · D1). */
function itemHasProductEvidence(digest, itemName) {
  if (!digest) return false;
  const nm = String(itemName || '').trim();
  if (!nm) return false;
  try {
    const pm = digest.photo_map && digest.photo_map.entries;
    if (pm && typeof pm === 'object') {
      for (const e of Object.values(pm)) {
        if (e && e.item && sameItemName(String(e.item), nm)) return true;
      }
    }
    if (Array.isArray(digest.productos_nombrados)) {
      for (const x of digest.productos_nombrados) {
        if (x && sameItemName(String(x.nombre || x), nm) && Array.isArray(x.clases) && x.clases.includes('catalogo')
          && ['catalogo', 'web-catalog', 'bio-link'].includes(String(x.fuente || ''))) return true;
      }
    }
  } catch (e) { /* sin evidencia legible: manda la familia */ }
  return false;
}
/* ¿La estrella tiene evidencia de NOMBRE PROPIO de producto?
 * Principio (LOTE CORRECTIVO-4): una categoría o una línea NUNCA es
 * estrella, aunque «aparezca» — la estrella calza con un producto o
 * modelo evidenciado: la lista productos_nombrados del digest
 * (captions/catálogo/ADN) o un nombre real de su Tiendanube.
 * (LOTE CORRECTIVO-8) Y la evidencia de captions ya no se valida a
 * sí misma: la entrada que solo vive en las captions necesita
 * corroboración cruzada (namedEntryCorroborated) — sin ella no hay
 * estrella, cae a null y el wow degrada honesto (L4). La marca
 * explícita del dueño (duenoStarEvidenceMatch, calce exacto) y las
 * ventas reales de Tiendanube quedan como siempre: son fuentes
 * ajenas al minero.
 * · Digest LEGADO (sin el campo): manda la composición de siempre
 *   (genérico/cromo/rol) — ningún fundamento viejo pierde su
 *   estrella por no traer el campo.
 * · Con el campo (aunque vacío): sin calce corroborado no hay
 *   estrella. */
function starNamedEvidenceOk(digest, name) {
  const s = String(name || '').trim();
  if (!s) return false;
  if (isGenericCategoryName(s) || isChromeDerivedName(s) || isCreditRoleName(s)) return false;
  if (!digest || !Array.isArray(digest.productos_nombrados)) return true;
  const tn = tnBlockOf(digest);
  if (tn) {
    if (tn.star && tn.star.name && sameItemName(String(tn.star.name), s)) return true;
    for (const t of (tn.top_sellers || [])) if (t && t.name && sameItemName(String(t.name), s)) return true;
  }
  const matches = digest.productos_nombrados.filter((x) => x && sameItemName(String(x.nombre || x), s));
  if (!matches.length) return false;
  return matches.some((e) => (e && e.fuente !== 'caption') || namedEntryCorroborated(e));
}
/* (LOTE INGESTA — caso Veja/Byredo/Crumbl, 11/11) Nombre de SECCIÓN
 * del sitio (menú, pie, legal, ayuda), no un producto: un tema que
 * viene únicamente del cromo del sitio nunca puede ser estrella — y en
 * la compilación tampoco ancla temas. Extiende la guarda v924 (que
 * solo conocía género/categoría) a los rótulos de cromo.
 * · Frases exactas de sección (normalizadas, sin acentos): un producto
 *   real nunca se llama exactamente «Customer Services», «Legal» o
 *   «Privacy Policy». Las multi-palabra casan contenidas («Customer
 *   Service Center»); las de una palabra, solo exactas («Legal advice»
 *   NO es cromo: es un servicio real de una firma de abogados).
 * · Cierre en «menu»: «Dirty Soda Value Menu» es una sección de la
 *   carta, no un sabor. «Menu Keto» y «Menú del día» NO cierran en
 *   menu y no se tocan (son oferta real).
 * LÍMITE: un nombre de sección propio de la marca («PROJET», el menú
 * de Veja) no se puede listar — solo lo frena el strip en la ingesta
 * (web-extract/deep-read), no esta guarda por nombre. */
const CHROME_SECTION_PHRASES = [
  'customer service', 'customer services', 'customer support', 'customer care',
  'legal', 'legal notice', 'privacy', 'privacy policy',
  'terms', 'terms of service', 'terms and conditions',
  'help', 'help center', 'help centre', 'faq', 'faqs',
  'contact', 'contact us', 'about', 'about us',
  'shipping', 'shipping and returns', 'returns', 'returns and exchanges',
  'newsletter', 'my account', 'shopping cart', 'shopping bag', 'my cart',
  'new arrivals', 'shop all', 'shop now', 'sign in', 'log in', 'sign up',
  'checkout', 'track order', 'track your order', 'join our tribe',
  'join the club', 'store locator', 'find a store', 'careers', 'press',
  'investors', 'sitemap', 'cookies', 'cookie policy', 'accessibility',
  'gift card', 'gift cards', 'wishlist', 'my wishlist', 'view all',
  'view options', 'quick view',
  'ayuda', 'aviso legal', 'terminos', 'terminos y condiciones',
  'politica de privacidad', 'politica', 'contacto', 'nosotros',
  'envios', 'devoluciones', 'mi cuenta', 'carrito', 'preguntas frecuentes',
];
function isChromeDerivedName(raw) {
  const s = String(raw || '').trim();
  if (!s) return true; // vacío: nada que coronar
  const n = norm(s);
  if (!n) return true;
  for (const p of CHROME_SECTION_PHRASES) {
    if (n === p) return true;
    if (p.includes(' ') && n.includes(p)) return true;
  }
  const words = n.split(' ').filter(Boolean);
  if (words.length >= 2 && (words[words.length - 1] === 'menu' || words[words.length - 1] === 'menus')) return true;
  return false;
}
/* (LOTE TARTINE-FRENOS · P5 — corrida Tartine, 13/11) CLASE «RÓTULO
 * DEL SITIO»: el saludo del hero, las secciones y la navegación del
 * sitio del negocio NO son productos. En la corrida, el <title>/hero
 * de tartinebakery.com («Welcome to Tartine») se minó como
 * productos[0], la estrella ancló en el rótulo y el titular del primer
 * posteo salió «Try Welcome to Tartine today». La clase se chequea
 * sobre el nombre normalizado (sin acentos, minúsculas) y es
 * conservadora a propósito: saludo + destino («welcome to X»,
 * «bienvenidos a X»), saludos sueltos y rótulos exactos de sección/
 * navegación. Un producto real con nombre propio («Welcome Wagon
 * Burger») no matchea ninguna forma: las formas de saludo exigen el
 * destino o el rótulo pelado. */
const SITE_LABEL_EXACT = new Set(['welcome', 'bienvenido', 'bienvenida', 'bienvenidos', 'bienvenidas', 'hello', 'hola',
  'home', 'inicio', 'menu', 'about us', 'our story', 'nuestra historia',
  'order online', 'pedidos online', 'book a table', 'store locator',
  'find a store', 'shop all', 'view all']);
const SITE_LABEL_PREFIX = ['welcome to ', 'bienvenido a ', 'bienvenida a ', 'bienvenidos a ', 'bienvenidas a ', 'welcome home'];
function isSiteLabelName(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  const n = norm(s);
  if (!n) return false;
  if (SITE_LABEL_EXACT.has(n)) return true;
  for (const p of SITE_LABEL_PREFIX) if (n === p.trim() || n.startsWith(p)) return true;
  return false;
}
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
  // (FIX-ENTRADA-PRUEBA · 5/11) Variable de plantilla sin reemplazar
  // (clave=valor, {{...}}, ${...}): jamás es un producto o servicio —
  // sin este rechazo, una línea del sistema («tema=tip») se minaba como
  // ítem y anclaba los titulares de la semana.
  if (/=/.test(s)) return false;
  if (/\{\{|\}\}|\$\{/.test(s)) return false;
  // (LOTE PLACEHOLDER-COPY) Una barra es un rótulo o una ruta
  // («Country/region and currency», «Men/Women»), nunca un producto.
  if (s.includes('/')) return false;
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
  // (LOTE ESTRELLA-MODELO-REAL · v924) Género, no producto: «HOMME»
  // (la categoría de la tienda de Veja) entraba como ítem y el picker
  // lo coronaba estrella. Misma clase que la audiencia suelta (D4):
  // nombra A QUIÉN, no QUÉ se vende.
  if (isGenderOnlyName(s)) return false;
  // (v348 · D4) Segunda persona: un ítem que le habla AL dueño ("tu
  // negocio", "vos aprobás") es copy de venta del propio Posty o un
  // fragmento de pitch — nunca la oferta del negocio.
  if (nw.some((w) => OFFER_SECOND_PERSON.has(w))) return false;
  if (nw.some((w) => OFFER_2P_VERBS.has(w))) return false;
  // (LOTE PLACEHOLDER-COPY) Chrome de tienda (ver OFFER_STORE_CHROME):
  // el rótulo del selector de país/moneda, del carrito o de una
  // sección no es algo que el negocio venda.
  const ns = norm(s);
  if (OFFER_STORE_CHROME.some((p) => ns.includes(p))) return false;
  // (JULI · 2026-11-07 — ids 571/573) Rótulos en inglés de colección/
  // menú (ver OFFER_ENGLISH_LABELS) + el plural «coffees»: en español
  // no son nombres de producto y anclan captions rotos.
  if (OFFER_ENGLISH_LABELS.some((p) => ns.includes(p))) return false;
  if (nw.includes('coffees')) return false;
  // (LOTE TARTINE-FRENOS · P5) Rótulo del sitio (saludo del hero,
  // sección, navegación): jamás es un ítem de la oferta — la lista de
  // productos que alimenta la estrella sale limpia de rótulos.
  if (isSiteLabelName(s)) return false;
  // (LOTE PLACEHOLDER-COPY) Slogan de dos oraciones («Timeless style.
  // Effortless you.»): es el hero de la tienda, no un producto. La
  // guarda de abreviatura (primer segmento de UNA palabra: «Dr.»,
  // «St.») evita rechazar marcas reales («Dr. Martens»).
  const _segs = s.split(/[.?!]\s+/);
  if (_segs.length > 1 && _segs[0].split(' ').filter(Boolean).length >= 2) return false;
  return true;
}
/* (JULI · 2026-11-08 — id 576, Top Class Barber Squad, 7/11)
 * El frame del tip («3 claves para elegir bien en X») exige que X sea
 * algo ELEGIBLE: una cosa con variantes entre las que el seguidor
 * elige (café, vestido, corte, anillo). Una cualidad del servicio
 * («atención personalizada») no se elige: el frame sale en español
 * roto («elegir bien en atención personalizada») y el cuerpo se vuelve
 * tautología («así trabajamos atención personalizada»). Un ítem es
 * elegible cuando su primera palabra de contenido NO es un sustantivo
 * abstracto de servicio: la lista es corta y conservadora — si la
 * primera palabra no está en ella, el ítem se considera elegible. La
 * regla mira solo la primera palabra: «corte de pelo» pasa (corte),
 * «asesoría de imagen» no (asesoría). */
const TIP_ABSTRACT_FIRST = new Set(['atencion', 'servicio', 'servicios', 'experiencia', 'calidad', 'asesoria', 'consultoria', 'trato', 'calidez', 'compromiso', 'confianza', 'puntualidad', 'dedicacion', 'pasion', 'excelencia', 'profesionalismo', 'eficiencia', 'responsabilidad', 'belleza', 'estetica']);
const TIP_STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'en', 'y', 'con', 'para', 'tu', 'su', 'un', 'una', 'del']);
function isChoosableTipItem(raw) {
  const s = cleanOfferName(raw);
  if (!s) return false;
  const words = norm(s).split(' ').filter(Boolean).filter((w) => !TIP_STOPWORDS.has(w));
  if (!words.length) return false;
  return !TIP_ABSTRACT_FIRST.has(words[0]);
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
    // (LOTE LÍNEAS-ROJAS-TITULAR · 7/11) La etiqueta de las líneas
    // rojas no es una oferta: «LÍNEAS ROJAS — NUNCA PUBLICAR: ...»
    // se partía en «LÍNEAS ROJAS» y entraba como servicio — de ahí
    // salía el titular del lunes de Top Class.
    if (isVetoLabelText(s)) continue;
    // (LOTE PRUEBA-PRODUCTO-REAL) Las líneas del espejo son texto del
    // sistema («Productos confirmados por el dueño en el espejo (usar
    // EXACTAMENTE estos…)»): minarlas convertía la ETIQUETA en un
    // «servicio» y el porqué afirmaba que la foto «muestra Productos
    // confirmados por el dueño». Nunca son oferta del negocio.
    if (/confirmados? por el dueñ|confirmed by the owner|usar EXACTAMENTE|use EXACTLY/i.test(s)) continue;
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
    // (LOTE PRUEBA-PRODUCTO-REAL) Basura de fecha: un segmento con año
    // («Lanzamiento 1», «2027») no es una oferta — la bio con fechas
    // de lanzamiento lo colaba como «servicio» y de ahí a los temas
    // («Lanzamiento 1», «2027» como titulares de la semana).
    if (/\b(19|20)\d{2}\b/.test(s) || /^\d+$/.test(s) || /lanzamiento|coming soon|próximamente|proximamente/i.test(s)) continue;
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
  // (AUDITORÍA DE ORIGEN DE PRECIOS · precisión 2 — LOTE
  // PRIMER-POSTEO-PERFECTO) El parseo laxo promovía CUALQUIER token $
  // del nombre a «precio del ítem» («Remera $500 OFF» nacía con precio
  // $500: un descuento disfrazado de precio). El precio se lee del
  // nombre SOLO si lo CIERRA (al final, como lo publican los
  // catálogos: «Pizza grande $1.200»): un $ en el medio del nombre es
  // texto del nombre, no un precio con fuente. El campo precio
  // explícito del ítem no pasa por acá: es dato directo de la fuente.
  const m = String(str || '').match(/\$\s?[\d.,]+\s*$/);
  return m ? m[0].replace(/\s+/, ' ').trim() : '';
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
    // (LOTE PERSONALIZACIÓN 6/11) La marca del cliente tiene que verse:
    // logo_url = foto de perfil de IG (la lectura pública la trae); '' =
    // sin foto → NO se dibuja ningún logo. logo_paleta = colores sacados
    // del logo (el refresco async la calcula; [] = todavía no calculada).
    // voz_marcadores = sus palabras reales (captions + respuestas).
    // onda_elegida = { onda, at } cuando elige con un toque (ítem 2).
    // Ninguno entra en el hash de anclas (no son fundamento leído del
    // feed/web) y el refresco los preserva (applyDeepBlocks).
    logo_url: '', logo_paleta: [], logo_file: '', voz_marcadores: [], onda_elegida: null,
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
    // (ESTUDIO-PROFUNDO · M5 COMPETENCIA) La competencia del estudio:
    // fundamento.competitors (ver study-competitors.js: esquema y contrato
    // para el lote semanal de tendencias). null = todavía no estudiada. El
    // hash de anclas NO la cubre y el refresco la preserva por copia base.
    competitors: null,
    // (LOTE CORRECTIVO-5 · FORMATO DE LA MARCA) Formato dominante del
    // feed: { dominante: 'carrusel'|'reel'|'foto'|null, conteos:
    // {carrusel, foto, reel}, total, fuente } calculado de los posteos
    // ya leídos. null = nunca calculado (digest viejo o sin lectura de
    // posteos); dominante null adentro = calculado pero sin mayoría
    // clara («sin dato»: el comportamiento es el histórico). El hash de
    // anclas NO lo cubre y el refresco lo preserva (applyDeepBlocks).
    formatos: null,
    inferred_star: null, contradictions: [], question_candidates: [],
    // (LOTE CORRECTIVO-4) Productos CON NOMBRE evidenciados
    // [{nombre, fuente, menciones}]: minados de las captions del feed
    // y de los ítems de fuente fuerte (extractNamedProducts). La
    // estrella exige calzar con esta lista cuando el digest la trae
    // (starNamedEvidenceOk); el hash de anclas NO la cubre.
    productos_nombrados: [],
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
    // (M3 FICHA-OFERTA · ESTUDIO-PROFUNDO) La ficha de oferta con fechas
    // (study-offer.js): producto/precio/promo CON fecha de fin, compra,
    // horarios y ubicación, cada dato con procedencia. null = el estudio
    // todavía no corrió. Espacio de nombres propio: el resto del
    // fundamento no se reescribe. El hash de anclas NO la cubre (no es
    // fundamento leído del feed/web en el sentido de v229) y el refresco
    // la preserva con sus correcciones del cliente (applyDeepBlocks).
    offerSheet: null,
  };
}

/* buildFromParts — compila el digest desde las fuentes disponibles.
 * parts: { business, category, subcat,
 *          web:  {name, description, services[], city, palette[], url} | null,
 *          feed: {bio, captions[], name, handle, pic} | null,
 *          form: {description, goal} | null,
 *          ownerWords: [textos del dueño (respuestas/chat)] | null,
 *          dna:  {…business_dna…} | null,
 *          palette: [{hex, rol}] | feedPalette | null,
 *          registro: 'light'|'dark'|null,
 *          feedPosts: [posteos ya leídos del feed (embed/auditoría)] | null }
 * Prioridad de listas: ADN (editado por el dueño) → web → texto minado. */

/* (LOTE CORRECTIVO-5 · FORMATO DE LA MARCA) El formato también sigue a
 * la marca (regla de Valentino 12/11 20:32: «lo que veo en veja es que
 * suben carrousel en todos los posteos»): el estudio guarda el formato
 * DOMINANTE del feed — distribución carrusel/foto/reel con conteos —
 * calculado SOLO de los posteos ya leídos (embed/auditoría; sin fetches
 * nuevos). Dominante = mayoría clara: ≥3 posteos leídos, un único
 * formato al frente y con ≥50% del total. Sin eso, dominante = null
 * («sin dato»): los generadores se comportan como siempre. El bloque NO
 * entra en el hash de anclas (no es fundamento leído de oferta) y el
 * refresco lo preserva si la corrida fresca no trajo posteos
 * (applyDeepBlocks). */
const FORMATO_MIN_POSTS = 3;
function formatoDePosteoLeido(p) {
  if (!p || typeof p !== 'object') return null;
  const t = String(p.type || p.media_type || p.mediaType || '').trim().toLowerCase();
  if (t === 'graphsidecar' || t === 'sidecar' || t === 'carousel' || t === 'carousel_album' || t === 'carrusel') return 'carrusel';
  if (t === 'graphvideo' || t === 'video' || t === 'reel' || t === 'reels') return 'reel';
  if (t === 'graphimage' || t === 'image' || t === 'foto' || t === 'photo') return 'foto';
  if (p.is_video || p.video_url) return 'reel';
  return null;
}
/* (LOTE FORMATO-VENTANA · L4 del diagnóstico de la corrida Veja #6)
 * El dominante se computa sobre la VENTANA RECIENTE del feed — los
 * últimos FORMATO_VENTANA posteos leídos — y no sobre el total
 * histórico del embed: una marca carrusel-dominante en su conducta
 * reciente quedaba «foto» porque el cálculo pesaba años de fotos
 * (Veja: 51 posteos del embed → foto 33, mientras sus recents son
 * 6/6 carrusel). La recencia sale de taken_at (el embed lo trae por
 * posteo); si ningún posteo trae fecha, el orden del array ES el del
 * embed (más reciente primero). La regla de dominancia no cambia
 * (mínimo FORMATO_MIN_POSTS, el primero supera al segundo y duplica
 * la mitad): se aplica DENTRO de la ventana. El resultado registra el
 * cálculo completo — conteos y total DE LA VENTANA, más total_feed
 * (todo lo clasificable leído) y ventana — para que el payload de la
 * prueba lo muestre sin reconstruirlo (ver formato_diag en demo.js). */
const FORMATO_VENTANA = 12;
function formatosFromPosts(posts) {
  const leidos = [];
  for (const p of (Array.isArray(posts) ? posts : [])) {
    const f = formatoDePosteoLeido(p);
    if (!f) continue;
    const ts = (p && Number.isFinite(p.taken_at) && p.taken_at > 0) ? p.taken_at : null;
    leidos.push({ f, ts });
  }
  const totalFeed = leidos.length;
  // Recientes primero: con alguna fecha presente, taken_at manda
  // (descendente; empate o sin fecha conserva la posición relativa
  // tras los fechados — sort estable). Sin ninguna fecha, el orden
  // servido ya es reciente→viejo y se respeta tal cual.
  const recientes = leidos.slice();
  if (recientes.some((x) => x.ts != null)) {
    recientes.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }
  const conteos = { carrusel: 0, foto: 0, reel: 0 };
  let total = 0;
  for (const x of recientes.slice(0, FORMATO_VENTANA)) { conteos[x.f]++; total++; }
  let dominante = null;
  if (total >= FORMATO_MIN_POSTS) {
    const orden = Object.keys(conteos).sort((a, b) => conteos[b] - conteos[a]);
    const top = orden[0];
    if (conteos[top] > conteos[orden[1]] && conteos[top] * 2 >= total) dominante = top;
  }
  return { dominante, conteos, total, fuente: 'feed', ventana: FORMATO_VENTANA, total_feed: totalFeed };
}
/* El dominante que consumen los generadores: 'carrusel'|'reel'|'foto'
 * o null (sin dato / digest viejo). Nunca inventa: un bloque malformado
 * o sin dominante vale null. */
function formatoDominanteDe(digest) {
  const f = digest && digest.formatos;
  if (!f || typeof f !== 'object') return null;
  return (f.dominante === 'carrusel' || f.dominante === 'reel' || f.dominante === 'foto') ? f.dominante : null;
}
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

  // (LOTE PERSONALIZACIÓN · ítem 1) LOGO: la foto de perfil de IG ES el
  // logo en la mayoría de los negocios. Se guarda la URL tal cual la trae
  // la lectura pública; si no hay foto, queda '' y NO se dibuja ningún
  // logo (fail-closed: sin logo en el fundamento, no hay sello).
  // (LOTE LOGO-PRUEBA-REARME · punto 4) La lectura pública de la prueba
  // trae la foto como data: URI: también es fuente válida del logo (la
  // cosecha de archivo del server la decodifica); descartarla acá era
  // perder el logo del negocio antes de que existiera. https conserva
  // su corte de higiene; la data: viaja entera con un tope sano.
  if (p.feed && typeof p.feed.pic === 'string' && /^https:\/\//.test(p.feed.pic)) d.logo_url = p.feed.pic.slice(0, 500);
  else if (p.feed && typeof p.feed.pic === 'string' && /^data:image\//.test(p.feed.pic) && p.feed.pic.length <= 300000) d.logo_url = p.feed.pic;
  // (LOTE PERSONALIZACIÓN · ítem 3) VOZ: marcadores aprendidos de SUS
  // captions (+ palabras del dueño si el llamador las pasa en
  // p.ownerWords). Determinístico, USD 0. Sin captions, [].
  try {
    d.voz_marcadores = personalizacion.extraerMarcadoresVoz(
      (p.feed && Array.isArray(p.feed.captions)) ? p.feed.captions : [],
      Array.isArray(p.ownerWords) ? p.ownerWords : []);
  } catch (e) { d.voz_marcadores = []; }

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
  // (LOTE CORRECTIVO-5 · FORMATO DE LA MARCA) Formato dominante del
  // feed desde los posteos YA LEÍDOS (parts.feedPosts, o parts.feed.posts
  // si el llamador los trae ahí): sin fetches nuevos. Sin posteos en las
  // partes, el bloque queda null y el refresco preserva el guardado.
  try {
    const feedPosts = Array.isArray(p.feedPosts) ? p.feedPosts
      : (p.feed && Array.isArray(p.feed.posts) ? p.feed.posts : null);
    if (feedPosts) d.formatos = formatosFromPosts(feedPosts);
  } catch (e) { /* el formato jamás rompe el digest */ }
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
  // (LOTE CORRECTIVO-4) PRODUCTOS CON NOMBRE: los candidatos con
  // evidencia (captions del feed + ítems de fuente fuerte: ADN,
  // catálogo, bio-link, home) viajan en su campo y los que SOLO viven
  // en las captions SUMAN al pool de la inferida: un producto que la
  // marca nombra en su feed («Fresh Good Batch») puede ser la
  // estrella inferida aunque ninguna lista de ítems lo trajera.
  d.productos_nombrados = extractNamedProducts({
    captions: (p.feed && Array.isArray(p.feed.captions)) ? p.feed.captions : [],
    items: [...dnaProds, ...catalogItems, ...bioItems, ...webItems, ...dnaServs],
    business: d.business,
    handle: (p.feed && (p.feed.handle || p.feed.username)) || '',
  });
  const namedExtraItems = d.productos_nombrados
    .filter((x) => x.fuente === 'caption')
    .filter((x) => ![...d.productos, ...d.servicios].some((it) => sameItemName(String((it && it.nombre) || it || ''), x.nombre)))
    .map((x) => ({ nombre: x.nombre, fuente: 'caption' }));
  // Los nombrados que solo viven en las captions también entran a la
  // lista de productos (al final, con su fuente): son productos
  // reales de la marca y los consumidores de la estrella (el wow, la
  // rotación) buscan el ancla entre productos/servicios.
  for (const nx of namedExtraItems) {
    if (d.productos.length >= 12) break;
    d.productos.push({ nombre: nx.nombre, fuente: 'caption' });
  }
  // Producto estrella INFERIDO (frecuencia en su feed + prominencia en
  // su web + rendimiento medido): con evidencia, nunca adivinado.
  // El pool va SIN duplicados: un ítem repetido (productos +
  // nombrados de caption) empata consigo mismo en inferStar y la
  // estrella sale nula aunque la evidencia sea clara.
  const starPoolSeen = new Set();
  const starPool = [...d.productos, ...d.servicios, ...namedExtraItems].filter((x) => {
    const k = norm(String((x && x.nombre) || x || ''));
    if (!k || starPoolSeen.has(k)) return false;
    starPoolSeen.add(k);
    return true;
  });
  d.inferred_star = inferStar({
    items: starPool,
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
  // (CORRECTIVO-7) Veredictos de presencia de marca por foto: la
  // clasificación corre AFUERA (con sus topes y guardas de gasto); acá
  // solo se adoptan los veredictos ya emitidos — el false incluido.
  if (p.brandPresence && typeof p.brandPresence === 'object' && Object.keys(p.brandPresence).length) {
    d.brand_presence = { entries: sanitizeBrandPresence(p.brandPresence), at: now };
    if (!Object.keys(d.brand_presence.entries).length) d.brand_presence = null;
  }
  // (M3 FICHA-OFERTA) La ficha del estudio viaja tal cual (el módulo
  // study-offer es dueño de su forma): espacio de nombres propio dentro
  // del fundamento, sin reescribir nada de lo anterior.
  if (p.offerSheet && typeof p.offerSheet === 'object' && p.offerSheet.v) d.offerSheet = p.offerSheet;
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
  // (LOTE ESTRELLA-MODELO-REAL · v924) Una categoría no puede ser la
  // estrella inferida: se saca del puntaje antes de puntuar. Si no
  // queda ningún modelo real, no hay inferencia (no se adivina).
  // (LOTE INGESTA) Igual para un nombre de sección del sitio: un tema
  // que viene del cromo («Customer Services», «Dirty Soda Value Menu»)
  // nunca es estrella, aunque encabece el catálogo.
  const list = (items || []).filter((x) => x && (x.nombre || x) && !isGenericCategoryName(String(x.nombre || x)) && !isChromeDerivedName(String(x.nombre || x)) && !isCreditRoleName(String(x.nombre || x)));
  if (!list.length) return null;
  const caps = (captions || []).slice(0, 20);
  const scored = list.map((it) => {
    const nombre = String(it.nombre || it);
    const anchors = anchorsFromTexts([nombre]);
    // (LOTE CORRECTIVO-8) La frecuencia que puntúa es mención de
    // FRASE COMPLETA en el crudo: una palabra suelta del nombre en
    // una línea de créditos ya no infla el puntaje de nadie.
    const hit = (text) => pieceAnchored(text, anchors, { strictPhrase: true }).ok;
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
    // (LOTE PRIMER-POSTEO-MEJOR · idea 4) EL MÁS QUERIDO: el cariño
    // (likes + comentarios) de los posteos de la marca es una señal de
    // estrella. Escala-libre: el bonus va al ítem mencionado en el
    // posteo con MÁS cariño del set (relativo a la propia cuenta, no a
    // un umbral absoluto). Sin likes/comments en las métricas no hay
    // bonus (retrocompatible: las métricas viejas solo traen reach).
    // Nunca pisa dueño ni ventas: vive DENTRO de inferStar, la rama
    // inferida — effectiveStarOf ya ordena dueño → ventas → inferida.
    let bestLove = 0; let bestLoveText = '';
    for (const m of (metrics || [])) {
      const love = (Number(m && m.likes) || 0) + (Number(m && m.comments) || 0);
      if (love > bestLove) { bestLove = love; bestLoveText = String((m && m.text) || ''); }
    }
    if (bestLove > 0 && bestLoveText && hit(bestLoveText)) {
      score += 3;
      evidence.push(`es el más querido de su feed (${bestLove} interacciones en su posteo con más cariño)`);
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
/* (LOTE LÉXICO-INGLÉS · L7 del diagnóstico de la corrida Veja #6) El
 * `dice` es un sintagma nominal: NUNCA puede terminar en palabra de
 * función. El recorte histórico de la ventana usaba STOP, pensado para
 * el español — el «in» inglés no estaba, y de un caption «The Atlas in
 * hairy suede» nació el dice «Atlas in», que el gancho del wow convirtió
 * en «Atlas in everyone's asking for» (posteo 654). Este set suma las
 * palabras de función EN (preposiciones, artículo, conjunciones) a STOP
 * SOLO para el recorte del borde derecho de la ventana; STOP no se toca
 * (lo usan el minado de distintivas y otros caminos). */
/* (LOTE PRIMER-POSTEO-PERFECTO · pieza 4 — CLASE SUBORDINANTE
 * COLGANTE, auditoría Veja #7, posteo 659) Un nombre minado puede venir
 * cortado a mitad de la frase subordinada de su caption de origen:
 * «Salar, where» (de «Salar, where …»). Embebido en la fórmula del
 * titular sale «Try Salar, where today» — un fragmento, no un nombre.
 * Las subordinantes EN que abren una cláusula dependiente NUNCA pueden
 * ser la última palabra de un nombre ni de una línea sin cierre: son la
 * firma de la frase cortada. La clase es propia (no se mezcla con las
 * preposiciones de L7): estos términos recortan el borde del minado,
 * reparan nombres sembrados y frenan titulares/captions. */
const EN_HANGING_SUBORDINATORS = new Set(['where', 'when', 'while', 'because', 'since', 'although', 'though', 'unless', 'until', 'whereas', 'wherever', 'whenever', 'if']);
const LEX_TRAILING_FUNCTION = new Set([...STOP, ...EN_HANGING_SUBORDINATORS,
  ...('in on at to of by an as into onto upon over under between among about per via and or nor but').split(' ')]);
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
      while (end > start + 1 && LEX_TRAILING_FUNCTION.has(norms[end - 1])) end--;
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
    // (v907) La marca DENTRO de la escena: si la visión vio el logo /
    // packaging / letrero en la foto, el dato viaja con la entrada.
    out[String(k).slice(0, 300)] = { item: item.slice(0, 90), confianza: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.8, ...(v.marca === true ? { marca: true } : {}) };
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}
function photoProductFor(digest, key) {
  if (!digest || !digest.photo_map || !digest.photo_map.entries || !key) return null;
  const e = digest.photo_map.entries[String(key)];
  return e && e.item ? e.item : null;
}
// (v907) ¿La foto muestra LA MARCA del negocio dentro de la escena
// (logo, packaging con marca, letrero)? Lo dice la visión al clasificar
// la foto (classifyDigestPhotos → photo_map.entries[].marca).
function photoBrandVisible(digest, key) {
  if (!digest || !digest.photo_map || !digest.photo_map.entries || !key) return false;
  const e = digest.photo_map.entries[String(key)];
  return !!(e && e.marca === true);
}
// (CORRECTIVO-7 · GATE DE MARCA EN FOTO REAL) Veredictos de presencia
// por foto (deepRead.classifyBrandPresence): a diferencia del photo_map
// — que solo conserva fotos CON match de producto y registra la marca
// solo cuando se ve — este mapa guarda el veredicto de TODAS las fotos
// chequeadas, incluido el false (la visión la vio y el negocio NO está
// en la escena). Es la caché durable del gate: vive en el fundamento,
// viaja en el payload de la prueba y la cuenta lo hereda al registrarse.
function sanitizeBrandPresence(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!v || typeof v !== 'object' || typeof v.marca !== 'boolean') continue;
    // (LOTE LOGO-PRUEBA-REARME · punto 4) El TIPO de presencia viaja
    // con el veredicto: 'logo' (la marca gráfica: símbolo, logotipo,
    // letrero, packaging con su logo) vs 'texto' (solo palabras
    // impresas: el texto de una etiqueta). Sin tipo (veredictos
    // viejos) la entrada queda como estaba: la presencia vale, la
    // vara de logo no se pronuncia.
    const tipo = (v.tipo === 'logo' || v.tipo === 'texto' || v.tipo === 'ambos') ? v.tipo : null;
    out[String(k).slice(0, 300)] = { marca: v.marca === true, ...(tipo ? { tipo } : {}), ...(v.detalle ? { detalle: String(v.detalle).slice(0, 140) } : {}) };
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}
// Veredicto de presencia de UNA foto: true (la visión verificó que el
// negocio se ve en la escena) · false (la visión la vio y NO se ve) ·
// null (SIN VERIFICAR: nadie la chequeó — para la entrega de la prueba
// el null NO es un pase). Fuentes, en orden: el photo_map (marca:true
// de la clasificación foto→producto) y el mapa de presencia.
function brandPresenceOf(digest, key) {
  if (!digest || !key) return null;
  const k = String(key);
  const pm = (digest.photo_map && digest.photo_map.entries) ? digest.photo_map.entries[k] : null;
  if (pm && pm.marca === true) return true;
  const bp = (digest.brand_presence && digest.brand_presence.entries) ? digest.brand_presence.entries[k] : null;
  if (bp && typeof bp.marca === 'boolean') return bp.marca;
  return null;
}
// (LOTE LOGO-PRUEBA-REARME · punto 4) VARA ÚNICA DE LOGO: ¿la foto
// muestra el LOGO de la marca — su marca gráfica — o solo TEXTO con
// su nombre? Devuelve true (logo visto) · false (la visión vio la
// marca pero SOLO como texto impreso: la etiqueta de un frasco dice
// el nombre, pero el logo no está en la escena) · null (sin veredicto
// de tipo: la foto no se chequeó o el veredicto es de antes de la
// distinción — para ESTA vara el null no es un pase). Es la misma
// vara para todos los caminos: el texto de packaging ya no satisface
// «logo presente» en la foto real como lo satisfacía en la generada
// el archivo. Solo lee el mapa de presencia (el que distingue tipo);
// el photo_map no distingue y no se pronuncia acá.
function brandLogoOf(digest, key) {
  if (!digest || !key) return null;
  const bp = (digest.brand_presence && digest.brand_presence.entries) ? digest.brand_presence.entries[String(key)] : null;
  if (!bp || bp.marca !== true) return null;
  if (bp.tipo === 'logo' || bp.tipo === 'ambos') return true;
  if (bp.tipo === 'texto') return false;
  return null;
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
  // (LOTE L3 §7) La estrella del dueño solo suprime la pregunta si
  // VALIDA contra lo evidenciado (duenoStarEvidenceMatch): una
  // respuesta genérica descartada por L3 («proyecto») no la suprime.
  const starDelDueno = (d.dueno && d.dueno.estrella && duenoStarEvidenceMatch(d, d.dueno.estrella)) || (star && star.fuente === 'dueno');
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
  // (CORRECTIVO-7) Los veredictos de presencia se fusionan como el
  // photo_map: la corrida fresca pisa por clave, el resto sobrevive —
  // una foto ya chequeada no se vuelve a pagar en el próximo refresco.
  if (fresh.brand_presence && fresh.brand_presence.entries && Object.keys(fresh.brand_presence.entries).length) {
    const mergedPresence = { ...((out.brand_presence && out.brand_presence.entries) || {}), ...fresh.brand_presence.entries };
    out.brand_presence = { entries: mergedPresence, at: fresh.brand_presence.at || new Date().toISOString() };
  }
  // (LOTE PERSONALIZACIÓN · ítems 1 y 3) La voz se re-mina de los captions
  // y el logo se re-lee de la foto de perfil: solo reemplazan si la
  // corrida fresca TUVO feed (sin lectura, el «fresco» sería parcial y
  // borraría lo aprendido). La onda elegida y la paleta del logo nunca
  // las trae el fresco: sobreviven por la copia base de arriba.
  if (fresh.fuentes && fresh.fuentes.feed) {
    if (Array.isArray(fresh.voz_marcadores)) out.voz_marcadores = fresh.voz_marcadores;
    if (fresh.logo_url) out.logo_url = fresh.logo_url;
  }
  // (LOTE CORRECTIVO-5 · FORMATO DE LA MARCA) El formato dominante se
  // recalcula cuando la corrida fresca trajo posteos leídos; sin esa
  // lectura (fresh.formatos null), el guardado sobrevive por la copia
  // base de arriba — una corrida parcial no borra lo aprendido del feed.
  if (fresh.formatos) out.formatos = fresh.formatos;
  // (v238) El estrella que confirmó el DUEÑO (Posty pregunta) no lo pisa
  // una inferencia fresca: la respuesta en persona es la fuente más
  // fuerte. El bloque `dueno` entero sobrevive por la copia base de
  // arriba (el fresco nunca lo trae).
  if (fresh.inferred_star && !(out.inferred_star && out.inferred_star.fuente === 'dueno')) out.inferred_star = fresh.inferred_star;
  // (LOTE CORRECTIVO-4) Los productos con nombre se re-minan en cada
  // compilación fresca: la lista fresca manda cuando la trae.
  if (Array.isArray(fresh.productos_nombrados)) out.productos_nombrados = fresh.productos_nombrados;
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
  // (M3 FICHA-OFERTA) La ficha se fusiona, no se reemplaza a ciegas: la
  // extracción fresca manda en lo leído, pero las correcciones del
  // cliente guardadas (origen 'dueno') se re-aplican después — el
  // re-estudio semanal (mejora 6) nunca pisa lo corregido a mano. Sin
  // ficha fresca, la guardada sobrevive por la copia base de arriba.
  if (fresh.offerSheet || out.offerSheet) {
    try {
      const so = require('./study-offer');
      out.offerSheet = so.mergeOfferSheet(fresh.offerSheet || null, out.offerSheet || null);
    } catch (e) { /* sin merge: sobrevive la copia base */ }
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
/* (LOTE LÉXICO-INGLÉS · L7 del diagnóstico de la corrida Veja #6) Los
 * nombres minados conservan su artículo («The Salar») y las fórmulas EN
 * que agregan posesivo o verbo («choosing your X well», «that's how we
 * do X», «Book your X») lo duplicaban: «your the salar», «we do the
 * salar» (posteos 655/656 de la corrida #6). Al embeber en ESAS
 * posiciones el nombre va pelado; donde el artículo corresponde («3
 * keys to the Salar») no se toca. Sin artículo inicial, es identidad. */
function bareEnName(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(the|a|an)\s+(.+)$/i);
  return m ? m[2].trim() : t;
}
/* (LOTE LÉXICO-INGLÉS · L7) Lint determinístico de empalmes EN: la red
 * sobre lo que las fórmulas y el minado producen, fail-closed como la
 * puerta de idioma positivo (C9) — en deriveTopics el tema no nace y en
 * el wow el gancho cae a su forma neutra. La familia sale de la
 * evidencia de la corrida #6 (posteos 654–656): posesivo+artículo
 * («your the»), artículo duplicado («the the»), preposición colgante
 * ante «everyone's» («in everyone's asking for») y el nombre CON
 * artículo embebido tras posesivo/verbo («do the salar» — sin el
 * nombre, «do the» a secas no se puede juzgar: «do the right thing» es
 * inglés válido). Devuelve true si el texto está ROTO. */
const EN_SPLICE_FUNCTION_TAIL = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'with', 'and', 'or', 'your', 'our', 'in', 'on', 'at', 'by', 'from', ...EN_HANGING_SUBORDINATORS]);
/* Última palabra con contenido de un texto: sin emoji, sin puntuación
 * de borde («Salar, where ✨» → 'where'). Es la palabra que decide si
 * el texto quedó cortado a mitad de frase. */
function lastContentWord(text) {
  const w = String(text || '').replace(/[\p{Extended_Pictographic}]/gu, ' ').split(/\s+/)
    .map((x) => x.replace(/^[^a-zA-ZÀ-ÿ']+|[^a-zA-ZÀ-ÿ']+$/g, '').toLowerCase()).filter(Boolean);
  return w.length ? w[w.length - 1] : '';
}
/* ¿El texto termina en palabra colgante (función o subordinante)? Devuelve
 * la palabra o null. Lo usan el lint de empalmes, la puerta de captions
 * de generator.js y el gate de mostrar del primer posteo. */
function enHangingTail(text) {
  const last = lastContentWord(text);
  return (last && (EN_HANGING_SUBORDINATORS.has(last) || EN_SPLICE_FUNCTION_TAIL.has(last))) ? last : null;
}
function enSpliceLint(text, names) {
  const c = String(text || '');
  if (!c) return false;
  // (ADDENDUM 6C · LOTE PRIMER-POSTEO-PERFECTO) ARRANQUE CON
  // FRAGMENTO: «From, another favorite at Jeni's…» (posteo 666) — la
  // clase colgante también corre al INICIO: una palabra de función
  // seguida de coma como apertura es el resto de una frase cortada en
  // el minado, nunca una apertura válida.
  if (/^\s*(from|where|when|while|because|since|although|though|unless|until|whereas|with|without|by|of|to|for|and|but|or)\s*,/i.test(c)) return true;
  if (/\b(your|our|their|my|his|her|its)\s+(the|a|an)\b/i.test(c)) return true;
  if (/\b(the|a|an)\s+(the|a|an)\b/i.test(c)) return true;
  if (/\b(in|on|at|of|to|for|with|from|by|about|into|upon)\s+everyone's\b/i.test(c)) return true;
  const low = ` ${c.toLowerCase()} `;
  for (const n of (names || [])) {
    const nm = String(n || '').trim().toLowerCase();
    if (!/^(the|a|an)\s+\S/.test(nm)) continue;
    for (const frame of ['your ', 'our ', 'their ', 'my ', 'do ', 'does ', 'did ']) {
      if (low.includes(` ${frame}${nm}`)) return true;
    }
  }
  // (LOTE PRIMER-POSTEO-PERFECTO · pieza 4) LA CLASE SUBORDINANTE
  // COLGANTE (auditoría Veja #7, posteo 659): «Try Salar, where today»
  // no lo cazaba ningún patrón porque el texto no TERMINA en la
  // subordinante — termina el NOMBRE embebido. Dos reglas:
  //  (1) un nombre cuya última palabra es una subordinante colgante ES
  //      un fragmento cortado: cualquier texto que lo embeba sale roto
  //      («if» queda fuera acá: un nombre puede cerrar legítimamente
  //      en «…If» como juego de palabras completo; como cola de línea
  //      sin cierre sí es fragmento y lo caza la regla 2).
  //  (2) una línea que termina en subordinante colgante SIN puntuación
  //      de cierre es una frase cortada a la mitad.
  for (const n of (names || [])) {
    const last = lastContentWord(n);
    if (last && last !== 'if' && EN_HANGING_SUBORDINATORS.has(last)) return true;
  }
  for (const line of c.split(/\n+/)) {
    const t = line.trim();
    if (!t || /[.!?…]["']?$/.test(t)) continue;
    if (EN_HANGING_SUBORDINATORS.has(lastContentWord(t))) return true;
  }
  //  (3) LA COSTURA DEL EMPALME: «Salar, where today» — la fórmula
  //      «Try {nombre} today» recibió el nombre cortado «Salar, where»
  //      y la subordinante quedó EMBEBIDA, seguida del adverbio de la
  //      fórmula. Una subordinante tras coma seguida de un adverbio
  //      temporal suelto (today/tonight/tomorrow/now) no encabeza
  //      ninguna cláusula válida en estos textos: es la costura.
  if (/,\s*(where|when|while|because|since|although|though|unless|until|whereas)\s+(today|tonight|tomorrow|now)\b/i.test(c)) return true;
  return false;
}
/* Quita las palabras de función del borde derecho de un nombre/frase
 * («Atlas in» → «Atlas»): red para digests sembrados antes del fix del
 * minado, cuyo `dice` guardado puede seguir trayendo el borde roto. */
function trimFunctionTail(s) {
  const w = String(s || '').trim().split(/\s+/).filter(Boolean);
  while (w.length > 1 && EN_SPLICE_FUNCTION_TAIL.has(w[w.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) w.pop();
  // (LOTE PRIMER-POSTEO-PERFECTO) El nombre cortado trae la coma de la
  // frase de origen («Salar, where» → «Salar,»): sin subordinante ya no
  // queda puntuación colgando del borde.
  if (w.length) w[w.length - 1] = w[w.length - 1].replace(/[,;:]+$/, '');
  return w.join(' ');
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
  // (LOTE LÍNEAS-ROJAS-TITULAR · 7/11) Un digest ya envenenado
  // (sembrado desde una prueba anterior al fix) trae la etiqueta o el
  // término vetado como servicio: se saca acá, antes de anclar temas.
  // (JULI · 2026-11-08 — ids 571/573/577/578/579, cuentas 87/88/89)
  // La misma puerta de admisión que la ingesta (isPlausibleOfferItem)
  // se aplica acá: un digest sembrado ANTES del fix v755 sigue
  // trayendo rótulos EN («Best Sellers», «single origin coffees»,
  // «your bag»), barras («Country/region…») y slogans («Timeless
  // style. Effortless you.») como ítems, y sin este filtro anclan
  // temas aunque la ingesta nueva ya los rechace. Para un digest sano
  // es un no-op (la ingesta y el scrub al guardar ya los filtran).
  // (LOTE INGESTA) Un nombre de sección del sitio tampoco ancla temas:
  // la compilación es la última puerta para un digest sembrado antes
  // del fix (el cromo ya no entra en la ingesta nueva, pero un digest
  // viejo lo trae). El tipo genérico sigue valiendo como TEMA (v924);
  // el cromo ni siquiera eso: no es contenido del negocio.
  // (LOTE CORRECTIVO-8) Ídem para un rótulo de rol de créditos
  // («Model», «Model Photo») en un digest sembrado antes del fix.
  items = items.filter((x) => !isVetoText(name(x), digest.onboarding) && isPlausibleOfferItem(name(x)) && !isChromeDerivedName(name(x)) && !isCreditRoleName(name(x)));
  // (Posty conectado) Lo que su Tiendanube marca SIN STOCK no entra a la
  // rotación de temas: ninguna pieza nace sobre un producto agotado.
  const oosNames = tnOutOfStockNames(digest);
  if (oosNames.length) items = items.filter((x) => !tnNameMatch(name(x), oosNames));
  // (LOTE CORRECTIVO-8) La evidencia de nombre vale para CUALQUIER
  // ítem que un topic afirme como producto — slot 1, slot 2, tip y
  // reserva — no solo para la estrella: el ítem que SOLO vive en las
  // captions (entrada de productos_nombrados con fuente 'caption')
  // necesita su corroboración cruzada para anclar; sin ella, el
  // topic no nace sobre ese nombre (la semana sigue con los ítems
  // evidenciados y los temas del feed). Era el hueco por el que el
  // slot 2 salió «Model» y el tip «Meet The Atlas» en Veja #5.
  items = items.filter((x) => namedItemCorroborated(digest, name(x)));
  // (v230) El producto estrella INFERIDO (con confianza ≥0,5) abre la
  // rotación: la novedad de la semana es él. La confirmación del dueño
  // llega por el loop de preguntas (question_candidates).
  let starName = '';
  // (v238) POSTY PREGUNTA: lo que el dueño confirmó en persona abre la
  // rotación — su estrella primero; si no hay estrella de ninguna
  // fuente, lo que MÁS VENDE (también dicho por él) lidera igual.
  // (LOTE L3) Solo si calza con lo evidenciado (duenoStarEvidenceMatch):
  // una respuesta genérica sin calce («proyecto») no reordena nada; el
  // primer topic lo decide la inferida o el orden del digest.
  const duenoStarRaw = (digest.dueno && (digest.dueno.estrella || (!digest.inferred_star && digest.dueno.mas_vendido))) || '';
  const duenoStar = duenoStarRaw ? duenoStarEvidenceMatch(digest, duenoStarRaw) : '';
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
  // (LOTE ESTRELLA-MODELO-REAL · v924) La inferida genérica no
  // reordena: un digest sembrado antes del fix trae «HOMME» como
  // inferred_star y sin esta guarda subiría igual a ítem N.º 1.
  // (LOTE INGESTA) Igual para la inferida que es cromo: «Customer
  // Services» como inferred_star no reordena nada.
  if (!starName && digest.inferred_star && digest.inferred_star.item && (digest.inferred_star.confidence || 0) >= 0.5 && !isGenericCategoryName(digest.inferred_star.item) && !isChromeDerivedName(digest.inferred_star.item) && !isCreditRoleName(digest.inferred_star.item) && starNamedEvidenceOk(digest, digest.inferred_star.item)) {
    const si = items.findIndex((x) => sameItemName(name(x), digest.inferred_star.item));
    if (si > 0) { const [sx] = items.splice(si, 1); items.unshift(sx); }
    if (si >= 0) starName = name(items[0]);
  }
  const temasFeed = (digest.temas_feed || []).filter((t) => String(t).length >= 3 && !isVetoText(t, digest.onboarding));
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
    // (CORRECTIVO-9 · red final del camino determinístico) El caption
    // ya compuesto pasa el identificador positivo: si el veredicto es
    // un idioma que no es el de la marca, el tema NO nace — la semana
    // de la prueba se arma solo con captions que la puerta positiva
    // acepta, con el mismo criterio que el camino de IA. Sin
    // veredicto (caption corto/ambiguo) el tema sigue como siempre.
    const capTxt = frame.caption(A);
    const capLang = detectTextLang(capTxt);
    if (capLang && capLang !== (en ? 'en' : 'es')) return null;
    const headTxt = capWords(frame.headline(A), 6);
    // (LOTE LÉXICO-INGLÉS · L7) Segunda red del mismo choke point: un
    // tema EN cuyo titular o caption renderizado trae un empalme del
    // nombre minado («your the…», «in everyone's…», «do the…») NO nace
    // — misma vara fail-closed que el idioma positivo de acá arriba.
    if (en && enSpliceLint(`${headTxt}\n${capTxt}`, [A])) return null;
    const t = {
      kind,
      tag: frame.tag || '',
      tema: temaForText(A, category, (digest && digest.subcat) || ''),
      headline: headTxt,
      subline: frame.subline ? capWords(frame.subline(A), 8) : '',
      cta: frame.cta || '',
      caption: capTxt,
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
  // (LOTE ILUSTRADA-BAJO-LA-VARA · pieza 8) La familia manda por
  // ÍTEM, no por rubro pelado: un ítem con evidencia de producto
  // (itemHasProductEvidence) se narra como producto aunque el rubro
  // sea de la familia de servicios — el bundle de una tienda no es
  // «another service». Sin evidencia, el ítem sigue a su familia.
  const narraServicio = (it) => serviceFamily && !itemHasProductEvidence(digest, name(it));
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
  // (LOTE ETAPA-INSTAGRAM) ARCO DE LANZAMIENTO: con la etapa del IG
  // confirmada como 'lanzamiento' (digest.onboarding.etapa — el dueño
  // la confirmó con un toque en el chat), los 3 primeros topics NO son
  // producto suelto: presentan el negocio en 3 días. Día 1 presenta
  // el negocio · Día 2 la estrella COMO AVISO COMPLETO (visual:
  // 'listing': card del listing con marca + foto + precio + vendedor;
  // la foto NUNCA se recorta como héroe) · Día 3 cómo funciona. Los
  // topics del arco llevan marcador _launch: 1/2/3; el Día 2 ancla la
  // estrella (pickItem(0)) para que la rotación de abajo no la repita.
  // Con etapa 'irregular' o 'activo', nada cambia: sigue la rotación
  // de siempre. El demo genera la semana de 5 pero la prueba importa
  // solo los 3 primeros (importTrialWeek limit: 3) = el arco entero.
  const igEtapa = digest.onboarding && digest.onboarding.etapa;
  if (igEtapa === 'lanzamiento') {
    const bizName = String(digest.business || '').trim();
    const starItem = pickItem(0);
    const starA = starItem ? name(starItem) : '';
    const t1 = mk('novedad', bizName || 'nuestro negocio', {
      tag: en ? 'launch' : 'lanzamiento',
      headline: () => (en ? 'it all starts here' : 'todo empieza acá'),
      caption: (A) => (en ? `Meet ${A}: this is who we are.` : `Te presentamos ${A}: esto somos.`),
    });
    if (t1) { t1._launch = 1; topics.push(t1); }
    const t2 = mk('novedad', starA || bizName || 'nuestro negocio', {
      tag: en ? 'launch' : 'lanzamiento',
      headline: () => (en ? 'the star of the house' : 'la estrella de la casa'),
      caption: (A) => (en ? `Our star: ${A}.` : `Nuestra estrella: ${A}.`),
    });
    if (t2) { t2._launch = 2; t2.visual = 'listing'; topics.push(t2); }
    const t3 = mk('tip', bizName || 'nuestro negocio', {
      tag: en ? 'how it works' : 'cómo funciona',
      headline: () => (en ? 'that easy' : 'así de fácil'),
      caption: (A) => (en ? `How it works at ${A}: pick it, order it, done.` : `Así funciona en ${A}: elegís, pedís y listo.`),
    });
    if (t3) { t3._launch = 3; topics.push(t3); }
  }
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
    })) : narraServicio(it1) ? (en ? mk('novedad', A, {
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
  // (M3 FICHA-OFERTA) PUERTA DE FECHA: el slot promo solo lo ocupa una
  // oferta CON fecha de fin vigente (study-offer.promoVigentePara). Sin
  // ficha, la promo del dueño pasa como siempre (legacy); con ficha, una
  // promo sin fecha o vencida cae al else (novedad del ítem N.º 2) — la
  // clase del posteo 531 no nace. La pieza vigente lleva sus términos
  // (fecha de fin en el caption y en offer_ends_at).
  let promoVig = null;
  try {
    const so = require('./study-offer');
    promoVig = so.promoVigentePara(digest, new Date());
  } catch (e) { promoVig = (digest.promos || [])[0] ? { titulo: String((digest.promos[0] || {}).titulo || ''), ends_at: null, fuente: 'dueno' } : null; }
  const promo = promoVig;
  // (CORRECTIVO-9) El título de la promo es una frase minada (de su
  // web o su ficha): si su idioma detectado no es el de la marca, el
  // slot promo no nace sobre ese texto — cae a la novedad del ítem
  // N.º 2, como cuando no hay promo vigente.
  const promoTituloTxt = promo ? String(promo.titulo || promo).trim() : '';
  const promoLangOk = !promoTituloTxt || minedPhraseOk(promoTituloTxt, en);
  const promoEndsTxt = (() => {
    if (!promoVig || !promoVig.ends_at) return '';
    const [y, m, d] = String(promoVig.ends_at).split('-').map(Number);
    if (!y || !m || !d) return '';
    return en ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}` : `${d}/${m}/${y}`;
  })();
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
  } else if (promo && (promo.titulo || promo) && promoLangOk) {
    const A = String(promo.titulo || promo).trim();
    const dnaMatch = (digest.promos || []).find((pr) => pr && norm(String(pr.titulo || pr.nombre || '')) === norm(A));
    const promoPrice = (dnaMatch && typeof dnaMatch === 'object') ? String(dnaMatch.precio || '').trim() : '';
    const tituloWords = A.split(/\s+/).filter(Boolean).length;
    const tituloHasNum = numbersInText(A).size > 0;
    const priceInHeadline = !!promoPrice && !tituloHasNum && tituloWords <= 4;
    const termsLine = promoEndsTxt ? (en ? `\n\nValid until ${promoEndsTxt}.` : `\n\nVálido hasta el ${promoEndsTxt}.`) : '';
    const t = en ? mk('promo', A, {
      tag: 'PROMO',
      headline: (x) => (priceInHeadline ? `${x} at ${promoPrice}` : x),
      subline: () => ((promoPrice && !tituloHasNum && !priceInHeadline) ? `${promoPrice}, just like you see it` : ''),
      cta: 'I want this deal',
      caption: (x) => `${x} at ${bizPh} 🔥\n\nFor a limited time only: when it's gone, it's gone.${termsLine}\n\nMessage us and we'll hold yours 📩`,
    }) : mk('promo', A, {
      tag: 'PROMO',
      headline: (x) => (priceInHeadline ? `${x} a ${promoPrice}` : x),
      subline: () => ((promoPrice && !tituloHasNum && !priceInHeadline) ? `A ${promoPrice}, como lo ves` : ''),
      cta: 'Quiero aprovecharla',
      caption: (x) => `${x} en ${bizPh} 🔥\n\nEs por tiempo limitado: cuando se termina, se termina.${termsLine}\n\nEscribinos y te lo reservamos 📩`,
    });
    if (t) {
      if (promoVig && promoVig.ends_at) { t.offer_ends_at = promoVig.ends_at; t.offer_terms = promoEndsTxt; }
      topics.push(t);
    }
  } else {
    const it2 = pickItem(1);
    if (it2) {
      const A = name(it2);
      const t = narraServicio(it2) ? (en ? mk('novedad', A, {
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
  // (JULI · 2026-11-08 — id 576) El tip solo ancla un ítem ELEGIBLE:
  // se busca el primer ítem no usado que pase isChoosableTipItem. Si
  // no queda ninguno libre, se reutiliza la estrella (it1) SI es
  // elegible — el fallback histórico (pickItem(0) || it1) existe para
  // que la semana no quede con un hueco que el demo rellena con un
  // tema genérico del rubro («Los viernes se pide milanesa» en un
  // sushi: test-digest-foundation E2). Si NI la estrella es elegible,
  // el tip NO sale: mejor una semana sin tip que un tip en español
  // roto («elegir bien en atención personalizada»).
  const pickChoosableTipItem = () => {
    for (let i = 0; i < items.length; i++) {
      if (!used.has(norm(name(items[i]))) && isChoosableTipItem(name(items[i]))) return items[i];
    }
    if (it1 && isChoosableTipItem(name(it1))) return it1;
    return null;
  };
  const tipItem = pickChoosableTipItem();
  if (tipItem) {
    const A = name(tipItem);
    const short = capWords(A, 3);
    const t = en ? mk('tip', A, {
      tag: 'TIP',
      headline: () => `3 keys to ${short.toLowerCase()}`,
      subline: () => 'What we check before choosing',
      cta: 'Save this tip',
      caption: (x) => `3 keys to choosing your ${bareEnName(short).toLowerCase()} well 👇\n\nQuality, detail and the ${bizPh} standard: that's how we do ${bareEnName(x).toLowerCase()}.\n\nSave this post for when you need it 🔖`,
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
      headline: (x) => `Book your ${bareEnName(capWords(x, 3)).toLowerCase()}`,
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
      const t = narraServicio(it1) ? (en ? mk('reserva', A, {
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

// ---------- (LOTE PRIMER-POSTEO-ESPECTACULAR · v907) EL PRIMER POSTEO
// DE LA PRUEBA ES EL WOW ----------
// El primer posteo de la semana de prueba se arma con la identidad REAL
// de la marca — su producto estrella POR NOMBRE, sus rituales propios,
// su forma de hacer las cosas — sacado de su IG/web (el fundamento). Si
// el prompt no nombra el producto estrella real, el posteo sale
// genérico (caso Philz 595: «Nuevo blend de la casa», plantilla del
// catálogo que podría ser de cualquier cafetería).
// Y NUNCA muestra lo que la marca NO vende: los negativos salen de SUS
// propias palabras (diferencial, bio, temas del feed, onboarding) —
// patrones de negación, nunca una lista fija. Sin evidencia de un
// negativo, no se afirma ninguno (honestidad antes que bloqueo).
// (LOTE CORRECTIVO-9 · IDIOMA POSITIVO) Una frase MINADA (el
// diferencial de su web, una frase de su voz, el título de una promo)
// solo se reusa DENTRO de un posteo si su idioma detectado ES el de
// la marca. El caso Veja #5: el diferencial era el og:description en
// francés de veja-store.com y entró palabra por palabra como detalle
// del wow de una marca que postea en inglés — nadie comparaba el
// idioma de la frase contra el del contenido. Sin veredicto (frase
// corta o ambigua) la frase pasa: no se frena lo que no se puede
// juzgar. El filtro vive en el CONSUMO (los derive), no en la
// ingesta: el diferencial también alimenta prompts y negativos, donde
// su idioma original es contexto legítimo.
function minedPhraseOk(phrase, en) {
  const lv = detectTextLang(phrase);
  return !lv || lv === (en ? 'en' : 'es');
}
function firstSentence(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^[^.;!?\n]+[.;!?\n]?/);
  const one = (m ? m[0] : t).trim();
  const lim = max || 140;
  return one.length > lim ? one.slice(0, lim).trimEnd() + '…' : one;
}
// Quita las cláusulas de negación de una frase (la negación vive en los
// negativos, no en el caption ni en el ritual): «Pour-over taza a taza,
// sin espresso, sin lattes.» → «Pour-over taza a taza.»
function stripNegativeClauses(s) {
  let out = String(s || '');
  out = out.replace(/,?\s*\bsin\s+[^,.;]+/gi, '');
  out = out.replace(/,?\s*\bno\s+(?:hacemos|tenemos|vendemos|servimos|usamos|hay)\s+[^,.;]+/gi, '');
  out = out.replace(/,?\s*\bnada\s+de\s+[^,.;]+/gi, '');
  out = out.replace(/,?\s*\bwithout\s+[^,.;]+/gi, '');
  out = out.replace(/,?\s*\bwe\s+don'?t\s+(?:serve|sell|do|make|use|offer)\s+[^,.;]+/gi, '');
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/^[,\s]+/, '').replace(/,$/, '').trim();
  if (out && !/[.;!]$/.test(out)) out += '.';
  return out;
}
const WOW_NEG_LEAD_STOP = new Set(['de', 'con', 'y', 'ni', 'o', 'para', 'en', 'al', 'la', 'el', 'los', 'las', 'un', 'una', 'nada', 'the', 'a', 'an', 'and', 'or', 'with', 'of', 'any']);
const WOW_NEG_DROP = new Set(['nada', 'eso', 'esto', 'mas', 'mucho', 'tanto', 'siempre', 'nunca', 'ya', 'todavia', 'anything', 'everything', 'it', 'that', 'this']);
function brandNegatives(digest) {
  const texts = [];
  try {
    if (digest) {
      if (digest.diferencial) texts.push(String(digest.diferencial));
      if (digest.onboarding && digest.onboarding.diferencial) texts.push(String(digest.onboarding.diferencial));
      if (digest.bio) texts.push(String(digest.bio));
      if (digest.descripcion) texts.push(String(digest.descripcion));
      if (Array.isArray(digest.temas_feed)) texts.push(digest.temas_feed.map((x) => String(x || '')).join('. '));
    }
  } catch (e) { /* sin texto no hay negativos */ }
  const hay = texts.join(' | ');
  if (!hay.trim()) return [];
  // Patrones de negación (gramática, no productos): el PRODUCTO lo pone
  // la marca con sus palabras. Se prueban los dos idiomas: el texto del
  // fundamento puede venir en cualquiera, no lo decide el idioma de la
  // prueba.
  const WORD_ES = '[a-záéíóúñü]+';
  const WORD_EN = '[a-z]+';
  const pats = [
    new RegExp('\\bsin\\s+(' + WORD_ES + '(?:\\s+' + WORD_ES + '){0,2})', 'gi'),
    new RegExp('\\bno\\s+(?:hacemos|tenemos|vendemos|servimos|usamos|hay)\\s+(' + WORD_ES + '(?:\\s+' + WORD_ES + '){0,2})', 'gi'),
    new RegExp('\\bnada\\s+de\\s+(' + WORD_ES + '(?:\\s+' + WORD_ES + '){0,2})', 'gi'),
    new RegExp('\\bnunca\\s+(' + WORD_ES + '(?:\\s+' + WORD_ES + '){0,2})', 'gi'),
    new RegExp('\\bwithout\\s+(' + WORD_EN + '(?:\\s+' + WORD_EN + '){0,2})', 'gi'),
    new RegExp('\\bwe\\s+don\'?t\\s+(?:serve|sell|do|make|use|offer)\\s+(' + WORD_EN + '(?:\\s+' + WORD_EN + '){0,2})', 'gi'),
    new RegExp('\\bnever\\s+(' + WORD_EN + '(?:\\s+' + WORD_EN + '){0,2})', 'gi'),
  ];
  const base = [];
  const seen = new Set();
  for (const re of pats) {
    let m;
    while ((m = re.exec(hay)) !== null) {
      let words = String(m[1] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
      while (words.length && WOW_NEG_LEAD_STOP.has(words[0])) words.shift();
      while (words.length && WOW_NEG_LEAD_STOP.has(words[words.length - 1])) words.pop();
      if (!words.length) continue;
      const term = words.join(' ');
      if (term.length < 3 || WOW_NEG_DROP.has(term) || seen.has(term)) continue;
      seen.add(term);
      base.push(term);
      if (base.length >= 3) break;
    }
    if (base.length >= 3) break;
  }
  if (!base.length) return [];
  // Implicaciones visuales: sin latte → tampoco latte art; sin espresso
  // → tampoco latte art (el latte art se hace con espresso). El
  // «bebidas con espresso» se agrega en el idioma del prompt, en
  // deriveFirstPostWow (acá el término es universal: «latte art»).
  const out = base.slice();
  const hasLatte = base.some((t) => /latte/.test(t));
  const hasEspresso = base.some((t) => /espresso/.test(t));
  const hasMilk = base.some((t) => /leche|milk|lacteo|dairy/.test(t));
  if ((hasLatte || hasEspresso || hasMilk) && !seen.has('latte art')) { out.push('latte art'); seen.add('latte art'); }
  return out.slice(0, 4);
}
/* (LOTE L4 — ESTRELLA NULL ⇒ WOW DEGRADADO HONESTO) ¿El ancla es un
 * nombre genérico de categoría, no un producto con nombre? Dos
 * señales, sin listas de nombres propios:
 * · la guarda v924 de tipo genérico (zapatillas, perfume, café…);
 * · la FORMA de rótulo de menú: un solo token TODO EN MAYÚSCULAS, sin
 * dígitos, de 4+ letras (los tiles de categoría del sitio — RUNNING,
 * SANDALES, PROJET — se escriben así; los modelos reales van en Title
 * Case o llevan dígitos/guiones: Esplar, Campo, V-10, Air Force 1).
 * Límite honesto: un rótulo en minúsculas/mixto (accessoires,
 * NOUVEAUTés) no lo caza la forma — eso lo pela L5 por estructura,
 * no por nombre. */
function isGenericAnchorName(n) {
  const s = String(n || '').trim();
  if (!s) return true;
  if (isGenericCategoryName(s)) return true;
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length === 1 && toks[0].length >= 4 && /^[A-ZÁÉÍÓÚÑ]+$/.test(toks[0])) return true;
  return false;
}
/* (ADDENDUM 6B · LOTE PRIMER-POSTEO-PERFECTO — guarda de la estrella,
 * veredicto de la corrida de Jeni's) UNA SUSCRIPCIÓN NO ES LA
 * ESTRELLA: la estrella/insignia tiene que ser un producto concreto y
 * mostrable. «Pint Club» es la suscripción de Jeni's, no un sabor:
 * ningún posteo nombró un producto real y la imagen generada no
 * mostró ningún packaging. Suscripciones, planes, membresías, pases y
 * abonos no califican; si el más vendido es una suscripción, la
 * estrella es el producto que la suscripción ENTREGA (los sabores /
 * productos reales detrás). «club» como palabra final de un nombre
 * corto cuenta como suscripción («Pint Club»); un nombre que EMPIEZA
 * con Club («Club sandwich») es un producto y no se toca. */
function isSubscriptionLikeName(n) {
  const s = String(n || '').trim();
  if (!s) return false;
  if (/(suscrip|subscri|membres|membership|abono)/i.test(s)) return true;
  if (/\bplan(?:es)?\b/i.test(s)) return true;
  if (/\bpass\b/i.test(s)) return true;
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length >= 2 && toks.length <= 3 && /^club$/i.test(toks[toks.length - 1])) return true;
  return false;
}

/* (LOTE L4) Wow degradado honesto para estrella null con ancla
 * genérica: el primer posteo NO nombra ningún producto — es una
 * invitación de marca sobre la foto real del negocio. Sin claim de
 * estrella (sin «que todos piden», sin «favorito de la casa»), sin
 * digest_anchor y sin _star. La marca star_missing + star_retry_hint
 * es el contrato con el reintento correctivo: re-derivar la estrella
 * de la foto real del producto y, si la confirma, rearmar el wow. */
function degradedBrandWow(digest, opts) {
  const o = opts || {};
  const en = o.lang === 'en';
  const category = o.category || (digest && digest.category) || 'otro';
  const business = String((digest && digest.business) || '').trim();
  const biz = business || (en ? 'the house' : 'la casa');
  const difRaw = String(digest.diferencial || (digest.onboarding && digest.onboarding.diferencial) || '').trim();
  let ritual = stripNegativeClauses(firstSentence(difRaw, 140));
  // (CORRECTIVO-9) El ritual es la frase minada del diferencial: si su
  // idioma no es el de la marca, no entra al caption — cae la línea
  // honesta de la casa, como cuando no hay diferencial.
  if (ritual && !minedPhraseOk(ritual, en)) ritual = '';
  const ritualTxt = ritual || (en ? 'made our way' : 'hecho a nuestra manera');
  // (LOTE PRIMER-POSTEO-PERFECTO · pieza 4) El detalle de fallback era
  // un fragmento SIN SUJETO por construcción («Made our way.», auditoría
  // Veja #7): la línea honesta de la casa es una oración completa.
  const detail = ritual || (en ? 'We make it our way.' : 'Lo hacemos a nuestra manera.');
  const ctaLine = en ? `DM us and we'll walk you through how to start 📩` : `Escribinos por DM y te contamos cómo empezamos 📩`;
  const caption = `${biz} ✨\n\n${detail}\n\n${ctaLine}`;
  let negativos = brandNegatives(digest);
  if (negativos.some((t) => /espresso/.test(t))) negativos.push(en ? 'espresso-based drinks' : 'bebidas con espresso');
  negativos = [...new Set(negativos)].slice(0, 4);
  let imagePrompt = en
    ? `Hero photo from ${biz}: ${ritualTxt} Real photo from the client, close-up of the product with the brand inside the scene (their cup with their logo, their bags, their store or packaging), natural light, no text over the product. Never as a designed band or applied logo.`
    : `Foto hero de ${biz}: ${ritualTxt} Foto real del cliente, primer plano del producto con la marca dentro de la escena (su vaso con su logo, sus bolsas, su local o su packaging), luz natural, sin texto sobre el producto. Nunca como banda diseñada ni logo aplicado.`;
  if (negativos.length) imagePrompt += en ? ` DO NOT show: ${negativos.join(', ')}.` : ` NO mostrar: ${negativos.join(', ')}.`;
  return {
    kind: 'novedad',
    tag: en ? 'NEW' : 'NUEVO',
    tema: temaForText(business, category, (digest && digest.subcat) || ''),
    headline: capWords(en ? `Meet ${biz}` : `Conocé ${biz}`, 6),
    subline: '',
    cta: en ? 'Tell me more' : 'Quiero saber más',
    caption,
    image_prompt: imagePrompt,
    negativos,
    _digest: 1, digest_anchor: null,
    intent: 'autoridad', angle: 'directo', proof: '',
    star_missing: true, star_retry_hint: 'rederive-from-photo',
    _wow: 1,
  };
}
/* (ADDENDUM 2 DE VALENTINO 13/11 16:03 — «sí, debería pasar eso como
 * decís vos. Armalo así») LA INSIGNIA: rama explícita de la vara del
 * primer posteo para negocios cuya oferta NO tiene nombres propios
 * (gastronomía, servicios, oficios — el caso común de los clientes
 * reales). Si la estrella validada por nombre no existe (sale
 * categoría/genérico o no hay), la estrella es LA INSIGNIA: lo que el
 * negocio es conocido por vender, lo más pedido, lo más fotografiado.
 * Tres fuentes, en este orden:
 *  (1) la respuesta del dueño a la pregunta 1 del onboarding
 *      (dueno.mas_vendido: «¿qué es lo que más vendés?») — para estos
 *      negocios ESA respuesta es la estrella, dicha por él; manda
 *      cuando no validó como estrella por nombre (L3 exige calce con
 *      un ítem y estas frases no siempre calzan);
 *  (2) lo que el feed muestra y repite (inferred_star, SIN el piso de
 *      confianza de la estrella por nombre: como insignia no se le
 *      pide nombre propio, solo que sea la cosa repetida);
 *  (3) el producto_estrella sembrado del fundamento.
 * Una palabra suelta de categoría («pastas», «café») NO es insignia:
 * la insignia es una COSA nombrable como la piden los clientes. */
function insigniaOf(digest) {
  if (!digest || typeof digest !== 'object') return null;
  const limpia = (s) => String(s || '').trim().replace(/\s+/g, ' ');
  const usable = (s) => {
    const v = limpia(s);
    if (v.length < 3 || v.length > 60) return false;
    if (!isPlausibleOfferItem(v) || isChromeDerivedName(v) || isCreditRoleName(v)) return false;
    if (isSubscriptionLikeName(v)) return false; // (ADDENDUM 6B) una suscripción tampoco es la insignia
    if (isVetoText(v, digest.onboarding)) return false;
    // Categoría pelada de una palabra = rubro, no insignia.
    if (!/\s/.test(v) && isGenericCategoryName(v)) return false;
    return true;
  };
  const mv = digest.dueno && digest.dueno.mas_vendido;
  if (usable(mv)) return { frase: limpia(mv), fuente: 'dueno' };
  const inf = digest.inferred_star;
  if (inf && inf.item && usable(inf.item)) return { frase: limpia(inf.item), fuente: 'feed' };
  // (LOTE TARTINE-FRENOS · P4) CUARTA FUENTE: los TEMAS DEL FEED
  // (temas_feed — lo que el feed muestra y repite, minado de sus
  // captions y su bio). En la corrida Tartine las tres fuentes
  // clásicas vinieron vacías y la insignia no existió, aunque el feed
  // repetía su insignia (el Morning Bun vive en los temas del feed).
  // Cada tema pasa el MISMO filtro usable() de las demás fuentes: un
  // rótulo del sitio o una categoría pelada tampoco es insignia acá.
  const temasFeed = Array.isArray(digest.temas_feed) ? digest.temas_feed : [];
  for (const t of temasFeed) {
    const frase = t && typeof t === 'object' ? (t.nombre || t.tema || t.frase) : t;
    if (usable(frase)) return { frase: limpia(frase), fuente: 'temas_feed' };
  }
  if (usable(digest.producto_estrella)) return { frase: limpia(digest.producto_estrella), fuente: 'fundamento' };
  return null;
}
/* (LOTE TARTINE-FRENOS · P4) ¿El ancla de una «estrella» es VÁLIDA?
 * El test de degradación del wow medía la mera PRESENCIA del ancla
 * (digest_anchor no vacío): un rótulo del sitio minado como producto
 * («Welcome to Tartine») contaba como estrella con evidencia y la
 * insignia nunca degradaba. La validez es la de la puerta de
 * admisión: nombre plausible, ni chrome, ni rol de crédito, ni
 * suscripción, ni RÓTULO DEL SITIO (P5), ni veto del dueño. Un ancla
 * inválida degrada IGUAL que una estrella ausente. */
function starAnchorValida(digest, anchor) {
  const a = String(anchor || '').trim();
  if (!a) return false;
  if (!isPlausibleOfferItem(a)) return false;
  if (isChromeDerivedName(a) || isCreditRoleName(a)) return false;
  if (isSubscriptionLikeName(a)) return false;
  if (isSiteLabelName(a)) return false;
  if (digest && isVetoText(a, digest.onboarding)) return false;
  return true;
}
/* El wow de la INSIGNIA (espejo del degradado honesto, pero NOMBRANDO
 * la cosa): el primer posteo es de la insignia, nombrada como la piden
 * los clientes (la frase del dueño/feed, intacta). Sin claim de
 * estrella por nombre (star_missing queda: no hay nombre validado) y
 * sin precio (la insignia no es un ítem con precio propio: la puerta
 * de precios de la vara lo frenaría igual). */
function deriveInsigniaWow(digest, opts) {
  const o = opts || {};
  const en = o.lang === 'en';
  const category = o.category || (digest && digest.category) || 'otro';
  const business = String((digest && digest.business) || '').trim();
  if (!digest || !hasFoundation(digest)) return null;
  const ins = insigniaOf(digest);
  if (!ins) return null;
  const frase = ins.frase;
  const fraseCap = frase.charAt(0).toUpperCase() + frase.slice(1);
  const biz = business || (en ? 'the house' : 'la casa');
  const difRaw = String(digest.diferencial || (digest.onboarding && digest.onboarding.diferencial) || '').trim();
  let ritual = stripNegativeClauses(firstSentence(difRaw, 140));
  if (ritual && !minedPhraseOk(ritual, en)) ritual = '';
  let detail = ritual;
  if (!detail) {
    const voice = voicePhraseFor(digest, frase);
    if (voice && minedPhraseOk(voice, en)) detail = voice;
  }
  if (!detail) detail = en ? 'We make it our way.' : 'Lo hacemos a nuestra manera.';
  const SERVICE_FAMILY_CATS = new Set(['profesionales', 'servicios', 'salud', 'belleza', 'barberia', 'fitness', 'educacion', 'fotografia', 'inmobiliaria', 'autos', 'turismo', 'viajes', 'eventos', 'arte']);
  // (LOTE ILUSTRADA-BAJO-LA-VARA · pieza 8) Ídem deriveTopics: la
  // insignia con evidencia de producto cierra como producto.
  const serviceFamily = (SERVICE_FAMILY_CATS.has(category) || SERVICE_FAMILY_CATS.has(String(digest.category || ''))) && !itemHasProductEvidence(digest, frase);
  const ctaLine = serviceFamily
    ? (en ? `DM us and we'll walk you through how to start 📩` : `Escribinos por DM y te contamos cómo empezamos 📩`)
    : (en ? `Order yours today by DM 📩` : `Pedilo hoy por DM 📩`);
  const caption = `${fraseCap} ✨\n\n${detail}\n\n${ctaLine}`;
  let negativos = brandNegatives(digest);
  if (negativos.some((t) => /espresso/.test(t))) negativos.push(en ? 'espresso-based drinks' : 'bebidas con espresso');
  negativos = [...new Set(negativos)].slice(0, 4);
  const ritualTxt = ritual || (en ? 'made our way' : 'hecho a nuestra manera');
  let imagePrompt = en
    ? `Hero photo of ${frase} from ${biz}: ${ritualTxt} Real photo from the client, close-up of the signature dish/product with the brand inside the scene (their packaging, their bags, their store), natural light, no text over the product. Never as a designed band or applied logo.`
    : `Foto hero de ${frase} de ${biz}: ${ritualTxt} Foto real del cliente, primer plano de la insignia con la marca dentro de la escena (su packaging, sus bolsas, su local), luz natural, sin texto sobre el producto. Nunca como banda diseñada ni logo aplicado.`;
  if (negativos.length) imagePrompt += en ? ` DO NOT show: ${negativos.join(', ')}.` : ` NO mostrar: ${negativos.join(', ')}.`;
  return {
    kind: 'novedad',
    tag: en ? 'NEW' : 'NUEVO',
    tema: temaForText(frase, category, (digest && digest.subcat) || ''),
    headline: capWords(fraseCap, 6),
    subline: '',
    cta: serviceFamily ? (en ? 'Tell me more' : 'Quiero saber más') : (en ? 'I want mine' : 'Quiero el mío'),
    caption,
    image_prompt: imagePrompt,
    negativos,
    _digest: 1, digest_anchor: frase,
    intent: 'autoridad', angle: 'directo', proof: '',
    star_missing: true, star_retry_hint: 'insignia',
    _wow: 1, _insignia: 1, _insignia_fuente: ins.fuente,
  };
}

/* (ADDENDUM 3B DE VALENTINO 13/11 16:03 — PUERTA DE INTEGRIDAD DE
 * PRECIOS; evidencia en vivo: el caption de Jeni's afirmó «Yours for
 * $199.00, just like you see it» y $199 es el precio del plan de Posty,
 * no del producto) NINGÚN posteo lleva un precio que no venga de los
 * datos reales del negocio. La única fuente válida para el texto de
 * una pieza es el precio DEL ÍTEM DE ESA PIEZA (su producto ancla) en
 * el fundamento: un precio de otro ítem — o de ningún ítem — en el
 * caption del ancla es un precio sin fuente y se frena. Fail-closed. */
const PRICE_TOKEN_RE = /\$\s?\d[\d.,]*|\b(?:USD|EUR)\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:USD|EUR|dólares|dolares)\b/gi;
function priceValorOf(raw) {
  // La puntuación de la oración no es parte del precio («$199.00, just
  // like…» vale 199, no 19900): se recorta el borde antes de parsear.
  let s = String(raw || '').replace(/[^0-9.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // El ÚLTIMO separador es el decimal; el otro es de miles.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes('.')) {
    // «12.500» (miles AR) vs «199.00» (decimal EN): 3 dígitos tras un
    // único punto y parte entera corta = miles; 1-2 dígitos = decimal.
    if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}
function priceTokensOf(text) {
  const out = [];
  const re = new RegExp(PRICE_TOKEN_RE.source, 'gi');
  const t = String(text || '');
  let m;
  while ((m = re.exec(t))) {
    const valor = priceValorOf(m[0]);
    if (valor !== null && valor > 0) out.push({ raw: m[0].trim(), valor });
  }
  return out;
}
/* Precios con fuente para UNA pieza: los del ítem ancla en el
 * fundamento — las MISMAS listas que digestNumbers reconoce como
 * verdad del negocio (productos, servicios, catálogo profundo,
 * bio-link y ficha de oferta). Sin ancla, el conjunto es vacío a
 * propósito: sin producto propio no hay precio publicable. */
function sourcedPricesOf(digest, anchor) {
  const set = new Set();
  if (!digest || !anchor) return set;
  const lists = [digest.productos, digest.servicios,
    digest.catalog && digest.catalog.items, digest.bio_link && digest.bio_link.items,
    digest.offerSheet && digest.offerSheet.productos];
  for (const list of lists) {
    for (const it of (Array.isArray(list) ? list : [])) {
      if (!it || typeof it !== 'object') continue;
      if (!sameItemName(String(it.nombre || it.titulo || ''), anchor)) continue;
      for (const t of priceTokensOf(it.precio || '')) set.add(t.valor);
    }
  }
  return set;
}
/* (Auditoría de origen de precios — precisión sobre la regla B) Un
 * precio de SUSCRIPCIÓN o de VARIANTE no se afirma pelado: el $199 de
 * Jeni's era real, pero era la suscripción de 3 meses y el caption lo
 * afirmó con «just like you see it» — precio real, afirmación
 * engañosa. Si alguna fuente del fundamento trae el calificador de
 * ese precio para ese ítem (en su campo precio, su nombre o el
 * contexto de la ficha), el texto que lo afirma tiene que llevarlo;
 * si no lo lleva, la oración sale sin precio. */
const PRICE_QUALIFIER_RE = /(suscrip[a-záéíóúñü]*|subscri[a-záéíóúñü]*|mensual[a-záéíóúñü]*|por\s+mes|al\s+mes|\/\s?mes|\d+\s?(?:meses|months|d[ií]as|days)|por\s+a[ñn]o|anual[a-záéíóúñü]*|plan\s+(?:mensual|anual|trimestral|semestral))/i;
function priceQualifierOf(digest, anchor, valor) {
  if (!digest || !anchor || valor == null) return null;
  const chunks = [];
  const lists = [digest.productos, digest.servicios, digest.promos,
    digest.catalog && digest.catalog.items, digest.bio_link && digest.bio_link.items,
    digest.offerSheet && digest.offerSheet.productos];
  for (const list of lists) {
    for (const it of (Array.isArray(list) ? list : [])) {
      if (!it || typeof it !== 'object') continue;
      if (!sameItemName(String(it.nombre || it.titulo || ''), anchor)) continue;
      chunks.push(String(it.precio || ''), String(it.nombre || it.titulo || ''));
    }
  }
  for (const p of ((digest.offerSheet && digest.offerSheet.precios) || [])) {
    if (!p || typeof p !== 'object') continue;
    const toks = priceTokensOf(p.precio || '');
    if (toks.some((t) => t.valor === valor)) chunks.push(String(p.contexto || ''), String(p.precio || ''));
  }
  for (const c of chunks) {
    const m = c.match(PRICE_QUALIFIER_RE);
    if (m) return m[0].trim();
  }
  return null;
}
function unsourcedPriceTokens(text, sourced) {
  return priceTokensOf(text).filter((t) => !(sourced && sourced.has(t.valor)));
}
/* Escaneo por oración de la puerta de precios: cada oración con un
 * token de precio se juzga — (a) el número está entre los precios con
 * fuente del ancla (si no: 'sin-fuente'); (b) si ese precio trae
 * calificador en las fuentes (suscripción/variante), la oración tiene
 * que llevar el calificador (si no: 'sin-calificador'). Devuelve las
 * oraciones malas con su motivo: el análisis y el corte comparten el
 * mismo juicio. */
function priceSentenceScan(text, sourced, qualifierFor) {
  const malas = [];
  const t = String(text || '');
  if (!t) return malas;
  const normLow = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const block of t.split(/\n\s*\n/)) {
    for (const s of block.split(/(?<=[.!?…])\s+/)) {
      const toks = priceTokensOf(s);
      for (const tok of toks) {
        if (!(sourced && sourced.has(tok.valor))) { malas.push({ sentence: s, raw: tok.raw, valor: tok.valor, motivo: 'sin-fuente' }); continue; }
        if (typeof qualifierFor === 'function') {
          const q = qualifierFor(tok.valor);
          if (q) {
            const qWords = normLow(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 || /^\d+$/.test(w));
            const sLow = normLow(s);
            if (!qWords.some((w) => sLow.includes(w))) malas.push({ sentence: s, raw: tok.raw, valor: tok.valor, motivo: 'sin-calificador', calificador: q });
          }
        }
      }
    }
  }
  return malas;
}
function priceGateAnalyze(text, digest, anchor) {
  const sourced = sourcedPricesOf(digest, anchor);
  const malas = priceSentenceScan(text, sourced, (valor) => priceQualifierOf(digest, anchor, valor));
  return {
    tokens: priceTokensOf(text),
    sin_fuente: malas.filter((m) => m.motivo === 'sin-fuente'),
    sin_calificador: malas.filter((m) => m.motivo === 'sin-calificador'),
    ok: malas.length === 0,
  };
}
/* Saca las ORACIONES que la puerta frena (la cláusula de precio
 * entera: «Yours for $199.00, just like you see it.» sale completa —
 * la frase de venta no se conserva pegada a un precio que no pasa).
 * Devuelve { text, quitados: [{raw, motivo}] } . */
function stripPriceSentences(text, sourced, qualifierFor) {
  const malas = priceSentenceScan(text, sourced, qualifierFor);
  if (!malas.length) return { text: String(text || ''), quitados: [] };
  const badSentences = new Set(malas.map((m) => m.sentence));
  const quitados = malas.map((m) => ({ raw: m.raw, motivo: m.motivo }));
  const blocks = String(text || '').split(/\n\s*\n/).map((b) => {
    const kept = b.split(/(?<=[.!?…])\s+/).filter((s) => !badSentences.has(s));
    return kept.join(' ');
  }).filter((b) => b.trim());
  return { text: blocks.join('\n\n'), quitados };
}

/* (LOTE PRIMER-POSTEO-MEJOR · idea 5) VOZ DE LA MARCA: cómo nombra
 * LA MARCA a su estrella (forma `dice` del léxico) y qué frase suya
 * usar cuando no hay ritual ni precio. Sin léxico ni marcadores, null
 * y el primer posteo queda idéntico a hoy (regresión cero). */
function lexDiceFor(digest, nombre) {
  try {
    const entries = (digest && digest.lexicon && Array.isArray(digest.lexicon.entries)) ? digest.lexicon.entries : [];
    for (const e of entries) {
      if (!e || !e.item) continue;
      if (sameItemName(e.item, nombre) && typeof e.dice === 'string' && e.dice.trim().length >= 2) return e.dice.trim();
    }
  } catch (e) {}
  return null;
}
function voicePhraseFor(digest, nombre) {
  // Primer marcador que comparta una palabra de contenido (≥4 letras)
  // con la estrella; si no, el primer marcador; si no, la primera
  // frase del léxico. Tope 90 caracteres: es un detalle, no un párrafo.
  const contentWords = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const markers = (digest && Array.isArray(digest.voz_marcadores)) ? digest.voz_marcadores.map((m) => String(m || '').trim()).filter(Boolean) : [];
  const hit = (s) => {
    const n = String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return contentWords.some((w) => n.includes(w));
  };
  let pick = markers.find(hit) || markers[0] || null;
  if (!pick) {
    const frases = (digest && digest.lexicon && Array.isArray(digest.lexicon.frases)) ? digest.lexicon.frases.map((f) => String(f || '').trim()).filter(Boolean) : [];
    pick = frases.find(hit) || frases[0] || null;
  }
  if (!pick) return null;
  return pick.length > 90 ? pick.slice(0, 87).trim() + '…' : pick;
}
function deriveFirstPostWow(digest, opts) {
  const o = opts || {};
  const en = o.lang === 'en';
  const category = o.category || (digest && digest.category) || 'otro';
  const business = String((digest && digest.business) || '').trim();
  if (!digest || !hasFoundation(digest)) return null;
  // Pre-lanzamiento: presentación, no venta — sin wow.
  let etapaNow = (digest.etapa === 'pre-lanzamiento') ? digest.etapa : '';
  if (!etapaNow) { try { const et = detectEtapa(digest); if (et && et.etapa) etapaNow = et.etapa; } catch (e) {} }
  if (etapaNow === 'pre-lanzamiento') return null;
  const name = (x) => String((x && (x.nombre || x)) || '').trim();
  let items = [...(digest.productos || []), ...(digest.servicios || [])].filter((x) => x && (x.nombre || x));
  // (LOTE INGESTA) Igual que en deriveTopics: un nombre de sección del
  // sitio no ancla el primer posteo (el más visible de la semana).
  // (LOTE CORRECTIVO-8) Ni un rótulo de rol de créditos, en un digest
  // sembrado antes del fix: el degradado honesto de L4 (ancla neutra
  // sin claims) se reserva a productos reales, nunca a un artefacto.
  items = items.filter((x) => !isVetoText(name(x), digest.onboarding) && isPlausibleOfferItem(name(x)) && !isChromeDerivedName(name(x)) && !isCreditRoleName(name(x)));
  const oosNames = tnOutOfStockNames(digest);
  if (oosNames.length) items = items.filter((x) => !tnNameMatch(name(x), oosNames));
  if (!items.length) return null;
  // La estrella: la misma prioridad que effectiveStarOf (dueño → ventas
  // reales → inferida ≥0,5); si el dueño dijo qué más vende y no hay
  // inferida, eso manda (espejo de deriveTopics); si nada de eso, el
  // ítem real N.º 1 de la lista. La estrella tiene que estar en la
  // lista (ancla con foto): si el nombre no calza con ningún ítem, el
  // N.º 1 — nunca un nombre sin evidencia detrás.
  // (LOTE L4) Sin estrella confirmada, el N.º 1 NO se vende como
  // estrella: si es un nombre genérico de categoría, el wow degrada a
  // invitación de marca (degradedBrandWow); si es un producto real, se
  // ancla en él como producto más visible, sin claims de estrella, y
  // queda marcado star_missing para el reintento correctivo. La
  // estrella declarada por el dueño (mas_vendido que calza) se sigue
  // tratando como estrella — su validación contra lo evidenciado es L3,
  // no este lote.
  let starItem = null;
  let starEffSource = null;
  try {
    const eff = effectiveStarOf(digest);
    if (eff && eff.item) {
      const si = items.findIndex((x) => sameItemName(name(x), eff.item));
      if (si >= 0) { starItem = items[si]; starEffSource = eff.source || null; }
      else if (isPlausibleOfferItem(eff.item) && !isGenericAnchorName(eff.item) && !isChromeDerivedName(eff.item)) {
        // (LOTE PRIMER-POSTEO-PERFECTO · pieza 1 — LA ESTRELLA MANDA) La
        // estrella VALIDADA (dueño con calce de L3, ventas reales o
        // inferida con evidencia ≥0,5) manda AUNQUE el minado de ítems
        // no la liste: en Veja #7 la inferida era «The Atlas» y, al no
        // calzar con ningún ítem, el wow ancló en el primer ítem de la
        // lista — el primer posteo salió de otro producto. La estrella
        // validada ancla el wow con su nombre; el match de foto sigue
        // siendo por nombre contra el mapa, así que una foto real de
        // la estrella gana igual si existe.
        starItem = { nombre: String(eff.item) };
        starEffSource = eff.source || null;
      }
    }
  } catch (e) {}
  if (!starItem && digest.dueno && digest.dueno.mas_vendido && !digest.inferred_star) {
    // (LOTE CORRECTIVO-4) El mas_vendido del dueño pasa la validación
    // L3 como cualquier estrella (duenoStarEvidenceMatch endurecido):
    // un genérico («cafe», «running») no corona el wow — sin calce
    // validado sigue el degradado honesto de L4 (star_missing o
    // invitación de marca), nunca el claim de estrella.
    const mv = duenoStarEvidenceMatch(digest, digest.dueno.mas_vendido);
    if (mv) {
      const si = items.findIndex((x) => sameItemName(name(x), mv));
      if (si >= 0) starItem = items[si];
    }
  }
  let starMissing = false;
  if (!starItem) {
    const firstName = name(items[0]);
    if (isGenericAnchorName(firstName)) return degradedBrandWow(digest, o);
    starItem = items[0];
    starMissing = true;
  }
  let A = name(starItem);
  if (A.length < 3) return null;
  // (ADDENDUM 6B · LOTE PRIMER-POSTEO-PERFECTO) GUARDA DE SUSCRIPCIÓN:
  // si lo coronado es una suscripción/plan/membresía («Pint Club» en
  // Jeni's), NO es la estrella — la estrella es el producto que la
  // suscripción entrega: el primer ítem real no-suscripción de la
  // lista ancla como producto más visible (sin claim de estrella,
  // queda para el reintento) y el rechazo queda registrado en el
  // topic (_star_rechazada). Sin producto detrás: degradado honesto
  // con el rechazo registrado — la suscripción nunca se corona.
  let starRechazada = null;
  if (isSubscriptionLikeName(A)) {
    starRechazada = A;
    const alt = items.find((x) => { const nx = name(x); return nx && nx !== A && !isSubscriptionLikeName(nx) && !isGenericAnchorName(nx); });
    if (!alt) {
      const dw = degradedBrandWow(digest, o);
      if (dw) dw._star_rechazada = 'suscripcion:' + A;
      return dw;
    }
    starItem = alt;
    A = name(alt);
    starMissing = true;
  }
  // (LOTE PRIMER-POSTEO-MEJOR · idea 5) El nombre MOSTRADO usa la
  // forma con la que LA MARCA nombra a su estrella (léxico `dice`)
  // cuando existe; el ancla formal (digest_anchor) sigue siendo el
  // nombre formal, para el match de foto. Sin léxico, idéntico a hoy.
  let displayA = A;
  let voiceUsed = null;
  try {
    const dice = lexDiceFor(digest, A);
    if (dice && dice !== A) { displayA = dice; voiceUsed = 'dice'; }
  } catch (e) {}
  // (ADDENDUM 6B) La guarda de suscripción manda también sobre el
  // nombre MOSTRADO: si el léxico de la marca nombra al producto con
  // el nombre de la suscripción rechazada («Pint Club» por un sabor),
  // el titular no lo corona — se muestra el nombre del producto real.
  if (displayA !== A && isSubscriptionLikeName(displayA)) { displayA = A; voiceUsed = null; }
  const precio = String(starItem.precio || '').trim();
  // Familia de servicios (espejo del set de deriveTopics): cambia el
  // verbo del gancho y el CTA, no la estrella.
  const SERVICE_FAMILY_CATS = new Set(['profesionales', 'servicios', 'salud', 'belleza', 'barberia', 'fitness', 'educacion', 'fotografia', 'inmobiliaria', 'autos', 'turismo', 'viajes', 'eventos', 'arte']);
  // (LOTE ILUSTRADA-BAJO-LA-VARA · pieza 8) La estrella con evidencia
  // de PRODUCTO no se corona con la plantilla de reserva («Book …
  // today») ni el CTA de servicio: se narra como producto («Try …»).
  const serviceFamily = (SERVICE_FAMILY_CATS.has(category) || SERVICE_FAMILY_CATS.has(String(digest.category || ''))) && !itemHasProductEvidence(digest, A);
  // Ritual propio: la primera frase del diferencial (sus palabras), sin
  // las cláusulas de negación (el «sin espresso» vive en los negativos,
  // no en el caption ni en el ritual).
  const difRaw = String(digest.diferencial || (digest.onboarding && digest.onboarding.diferencial) || '').trim();
  let ritual = stripNegativeClauses(firstSentence(difRaw, 140));
  // (CORRECTIVO-9) El ritual es la frase minada del diferencial (el
  // og:description de su web, palabra por palabra): si su idioma
  // detectado no es el de la marca, NO se reusa como detalle del
  // posteo — el detalle cae al precio, a la frase de voz (también
  // filtrada) o a la línea honesta, nunca al texto en otro idioma.
  if (ritual && !minedPhraseOk(ritual, en)) ritual = '';
  const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
  // Gancho (≤6 palabras, nombre de la estrella INTACTO). Sin artículo:
  // el género del producto no se conoce y «El Limpieza…» rompería.
  // (LOTE L4) Sin estrella confirmada, nunca el claim de popularidad
  // («que todos piden» / «everyone's asking for»): el ancla es el
  // producto más visible, no la estrella — el gancho es una invitación
  // neutra a probarlo.
  let headline;
  const nA = words(displayA);
  if (en) {
    if (nA <= 2 && !starMissing) headline = `${displayA} everyone's asking for`;
    else if (nA <= 4) headline = serviceFamily ? `Book ${displayA} today` : `Try ${displayA} today`;
    else headline = capWords(displayA, 6);
  } else {
    if (nA <= 2 && !starMissing) headline = `${displayA} que todos piden`;
    else if (nA <= 4) headline = serviceFamily ? `${displayA}, reservá hoy` : `${displayA}, probalo hoy`;
    else headline = capWords(displayA, 6);
  }
  headline = capWords(headline, 6);
  // (LOTE LÉXICO-INGLÉS · L7) El gancho «everyone's asking for» con un
  // dice terminado en preposición («Atlas in») salía tal cual al titular
  // (posteo 654). El minado ya no produce ese dice, pero un digest
  // sembrado antes del fix lo puede seguir trayendo: si el titular
  // renderizado trae el empalme, el gancho cae a la forma neutra con el
  // nombre limpio de borde — el texto roto nunca sale.
  if (en && enSpliceLint(headline, [A, displayA])) {
    const cleanA = trimFunctionTail(displayA);
    headline = capWords(serviceFamily ? `Book ${cleanA} today` : `Try ${cleanA} today`, 6);
    if (enSpliceLint(headline, [A, cleanA])) headline = capWords(cleanA, 6);
  }
  // Caption en voz humana, 3 bloques: estrella / detalle concreto /
  // CTA. El detalle es ritual + precio (lo que haya); sin ninguno, una
  // frase REAL de la marca (idea 5) en vez del genérico «favorito de la
  // casa» — la estrella lo es por definición, pero suena como Posty.
  // (LOTE L4) Sin estrella confirmada, la línea honesta es la manera
  // de la casa — nunca un favorito que no se verificó (eso manda sobre
  // la frase de voz: el degradado honesto no se rearma).
  const priceLine = precio ? (en ? `Yours for ${precio}, just like you see it.` : `Lo tenés a ${precio}, como lo ves.`) : '';
  let detail = [ritual, priceLine].filter(Boolean).join(' ');
  if (!detail) {
    if (starMissing) detail = en ? 'We make it our way.' : 'Lo hacemos a nuestra manera.'; // (PRIMER-POSTEO-PERFECTO) oración completa, con sujeto — nunca el fragmento «Made our way.»
    else {
      const voiceLine = voicePhraseFor(digest, A);
      // (CORRECTIVO-9) La frase de voz también es una frase minada:
      // mismo filtro de idioma que el diferencial.
      if (voiceLine && minedPhraseOk(voiceLine, en)) { detail = voiceLine; if (!voiceUsed) voiceUsed = 'frase'; }
      else detail = en ? 'The house favorite, ready for you.' : 'El favorito de la casa, listo para vos.';
    }
  }
  const ctaLine = serviceFamily
    ? (en ? `DM us and we'll walk you through how to start 📩` : `Escribinos por DM y te contamos cómo empezamos 📩`)
    : (en ? `Order yours today by DM 📩` : `Pedilo hoy por DM 📩`);
  const caption = `${displayA} ✨\n\n${detail}\n\n${ctaLine}`;
  const subline = precio ? (en ? `${precio}, just like you see it` : `A ${precio}, como lo ves`) : '';
  const cta = serviceFamily ? (en ? 'Tell me more' : 'Quiero saber más') : (en ? 'I want mine' : 'Quiero el mío');
  // Negativos por marca + prompt de imagen: el nombre de la estrella,
  // el ritual y la prohibición explícita de lo que no vende.
  let negativos = brandNegatives(digest);
  if (negativos.some((t) => /espresso/.test(t))) negativos.push(en ? 'espresso-based drinks' : 'bebidas con espresso');
  negativos = [...new Set(negativos)].slice(0, 4);
  const biz = business || (en ? 'the house' : 'la casa');
  const ritualTxt = ritual || (en ? 'made our way' : 'hecho a nuestra manera');
  let imagePrompt = en
    ? `Hero photo of ${displayA} from ${biz}: ${ritualTxt} Real photo from the client, close-up of the product with the brand inside the scene (their cup with their logo, their bags, their store or packaging), natural light, no text over the product. Never as a designed band or applied logo.`
    : `Foto hero de ${displayA} de ${biz}: ${ritualTxt} Foto real del cliente, primer plano del producto con la marca dentro de la escena (su vaso con su logo, sus bolsas, su local o su packaging), luz natural, sin texto sobre el producto. Nunca como banda diseñada ni logo aplicado.`;
  if (negativos.length) imagePrompt += en ? ` DO NOT show: ${negativos.join(', ')}.` : ` NO mostrar: ${negativos.join(', ')}.`;
  let sales = {};
  try {
    const sb = require('./sales-brain');
    if (sb) sales = sb.trialTopicSales({ kind: 'novedad', digest_anchor: A }, digest, o.lang) || {};
  } catch (e) { sales = {}; }
  return {
    kind: 'novedad',
    tag: en ? 'NEW' : 'NUEVO',
    tema: temaForText(A, category, (digest && digest.subcat) || ''),
    headline, subline, cta, caption,
    image_prompt: imagePrompt,
    negativos,
    _digest: 1, digest_anchor: A,
    intent: sales.intent || '', angle: sales.angle || '', proof: sales.proof || '',
    // (LOTE L4) Sin estrella confirmada, el ancla es el producto más
    // visible, no la estrella: no lleva _star y queda marcado para el
    // reintento correctivo (star_retry_hint: el reintento confirma el
    // ancla desde la foto real del producto y, si la confirma, rearma
    // el wow con el claim de estrella).
    ...(starMissing
      ? { star_missing: true, star_retry_hint: 'confirm-from-photo' }
      : { _star: 1 }),
    _wow: 1,
    // (LOTE PRIMER-POSTEO-PERFECTO) De dónde salió la estrella que ancla
    // el wow ('dueno'|'sales'|'inferred'), para el registro del gate de
    // mostrar del slot 0. null cuando el ancla es el ítem más visible.
    _star_source: starEffSource,
    // (ADDENDUM 6B) La suscripción rechazada como estrella, si la hubo
    // ('suscripcion:<nombre>'): el registro de la guarda.
    _star_rechazada: starRechazada ? 'suscripcion:' + starRechazada : null,
    // (LOTE PRIMER-POSTEO-MEJOR · idea 5) Qué voz se usó, si alguna:
    // 'dice' (forma propia de la marca para la estrella) o 'frase'
    // (frase real de la marca como detalle). null = sin voz (como hoy).
    voice_used: voiceUsed,
  };
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
    // (LOTE LÍNEAS-ROJAS-TITULAR · 7/11) Al guardar, un digest ya
    // envenenado se limpia: la etiqueta o el término vetado no quedan
    // como producto/servicio/promo para la próxima semana.
    // (LOTE INGESTA) Al guardar, un digest ya envenenado se limpia de
    // cromo: un rótulo de menú/pie no queda como producto/servicio/
    // promo ni como estrella inferida para la próxima semana.
    if (Array.isArray(d.productos)) d.productos = d.productos.filter((x) => isPlausibleOfferItem(x) && !isChromeDerivedName(x && (x.nombre || x)) && !isCreditRoleName(x && (x.nombre || x)) && !isVetoText(x && (x.nombre || x), d.onboarding));
    if (Array.isArray(d.servicios)) d.servicios = d.servicios.filter((x) => isPlausibleOfferItem(x) && !isChromeDerivedName(x && (x.nombre || x)) && !isCreditRoleName(x && (x.nombre || x)) && !isVetoText(x && (x.nombre || x), d.onboarding));
    if (Array.isArray(d.promos)) d.promos = d.promos.filter((x) => isPlausibleOfferItem(x && (x.titulo || x.nombre || x)) && !isChromeDerivedName(x && (x.titulo || x.nombre || x)) && !isCreditRoleName(x && (x.titulo || x.nombre || x)) && !isVetoText(x && (x.titulo || x.nombre || x), d.onboarding));
    if (d.inferred_star && d.inferred_star.item && (!isPlausibleOfferItem(d.inferred_star.item) || isChromeDerivedName(d.inferred_star.item) || isGenericCategoryName(d.inferred_star.item) || isCreditRoleName(d.inferred_star.item))) d.inferred_star = null;
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
  const starInf = (digest.inferred_star && (digest.inferred_star.confidence || 0) >= 0.5 && isPlausibleOfferItem(digest.inferred_star.item) && !isGenericCategoryName(digest.inferred_star.item) && starNamedEvidenceOk(digest, digest.inferred_star.item)) ? digest.inferred_star.item : '';
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
  offeringsFromText, isPlausibleOfferItem, isChoosableTipItem, scrubDigestItems, temasFromFreeText, temaForText,
  // (LOTE LÍNEAS-ROJAS-TITULAR · 7/11) Las líneas rojas son veto, nunca tema.
  isVetoLabelText, isVetoText, vetoTermsFromOnboarding, stripVetoLines, dropVetoTopics,
  buildFromParts, emptyDigest, finalizeDigest, digestHashOf, hasFoundation,
  // (LOTE CORRECTIVO-5 · FORMATO DE LA MARCA) Formato dominante del feed.
  formatosFromPosts, formatoDominanteDe,
  deriveTopics, deriveFirstPostWow, brandNegatives, ensureTable, saveDigest, getStoredDigest, getDigest,
  // (ADDENDUM 2 · LOTE PRIMER-POSTEO-PERFECTO) La insignia: la estrella
  // de los negocios sin nombres propios en su oferta.
  insigniaOf, deriveInsigniaWow, isSiteLabelName, starAnchorValida,
  // (ADDENDUM 3B · LOTE PRIMER-POSTEO-PERFECTO) Puerta de integridad de
  // precios: tokens, precios con fuente por ancla y corte de oraciones.
  priceTokensOf, sourcedPricesOf, unsourcedPriceTokens, stripPriceSentences,
  priceQualifierOf, priceSentenceScan, priceGateAnalyze,
  // (ADDENDUM 6B · LOTE PRIMER-POSTEO-PERFECTO) Una suscripción no es
  // la estrella: guarda de nombre para estrella e insignia.
  isSubscriptionLikeName,
  // (v348) Etapa pre-lanzamiento + remediación admin del fundamento
  detectEtapa, deleteDigest,
  dnaFragmentFromDigest,
  // (2026-10-20) Posty conectado (Tiendanube)
  tnBlockOf, tnNameMatch, tnOutOfStockNames, tnQuietNames, effectiveStarOf,
  // (LOTE L3) Validación de la estrella del dueño contra lo evidenciado.
  duenoStarEvidenceMatch,
  // (LOTE CORRECTIVO-4) Productos con nombre: extracción + evidencia.
  extractNamedProducts, starNamedEvidenceOk,
  // (LOTE CORRECTIVO-8) Rótulos de rol de créditos + corroboración.
  isCreditRoleName, namedItemCorroborated, itemHasProductEvidence,
  // (LOTE FOTOS-ELEGIBILIDAD · L1) La corroboración de UNA entrada,
  // exportada: el vocabulario del mapa foto→producto filtra los
  // nombrados del feed con la MISMA regla de C8 (sin auto-validación).
  namedEntryCorroborated,
  // (v231) Adopción de patrones: candado de números de promo
  numbersInText, digestNumbers, promoNumberGuard,
  // (v230) Lectura profunda
  parsePriceNum, sameItemName, detectContradictions, inferStar,
  // (LOTE ESTRELLA-MODELO-REAL · v924) Guarda de categoría (testeable)
  isGenericCategoryName, isGenderOnlyName,
  // (LOTE L4) Ancla genérica de categoría vs producto con nombre (testeable)
  isGenericAnchorName,
  // (LOTE INGESTA) Guarda de cromo: nombre de sección, no producto.
  isChromeDerivedName,
  // (LOTE PRIMER-POSTEO-MEJOR · idea 5) Voz de la marca en el wow.
  lexDiceFor, voicePhraseFor,
  buildLexicon, lexiconBlock, sanitizePhotoEntries, photoProductFor, photoBrandVisible,
  // (LOTE LÉXICO-INGLÉS · L7) Nombre pelado para fórmulas EN + lint de empalmes.
  bareEnName, enSpliceLint,
  // (LOTE PRIMER-POSTEO-PERFECTO · pieza 4) La clase subordinante
  // colgante como utilidades compartidas (puerta de captions, gate del
  // primer posteo).
  EN_HANGING_SUBORDINATORS, lastContentWord, enHangingTail, trimFunctionTail,
  // (CORRECTIVO-7) Gate de marca en foto real: veredictos de presencia.
  sanitizeBrandPresence, brandPresenceOf, brandLogoOf,
  questionCandidatesOf, applyDeepBlocks,
  // (v235) Identificación de rubro (rubro-id.js re-exportado)
  rubroId,
};
