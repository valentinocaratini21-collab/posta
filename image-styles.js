// image-styles.js — Lógica de estilos de imagen de Posty ("secret codes").
// Los datos (179 presets) viven en image-styles-data.js.
// brandSafe=true → respeta producto/colores (puede salir por default).
// brandSafe=false → fantasía pura: solo con intención explícita (diversión/viral)
// o elección manual, NUNCA por default.
//
// Regla de oro: el estilo jamás puede cambiar los colores de marca — el
// fragmento siempre lleva la línea de supremacía de paleta. (v233) En la
// generación de posteos el fragmento ya NO es un apéndice al final del
// prompt: entra en la posición de DIRECCIÓN DE ESTILO del ensamblado
// (assembleImagePrompt, tras composición/paleta, antes de la zona del
// titular), y el preset se elige ANTES de escribir el brief, consciente
// del digest del cliente (ver pickStyle).
'use strict';

const STYLES = require('./image-styles-data').concat(require('./image-styles-rubros'));

const BY_CODE = {};
for (const s of STYLES) BY_CODE[s.code] = s;

function getStyle(code) {
  if (!code) return null;
  const c = String(code).trim().toLowerCase();
  return BY_CODE[c] || BY_CODE['/' + c.replace(/^\//, '')] || null;
}

function listStyles() {
  return STYLES.map(s => ({ code: s.code, name: s.name, brandSafe: s.brandSafe }));
}

// ---------- Mapa intención → estilos rankeados ----------
// El generador conoce la intención de cada posteo (tipo + tema + ángulo).
// La fantasía (/legoify, /clay, /miniatureworld...) vive SOLO en 'viral'.
const INTENT_STYLES = {
  promo:      ['/popart', '/neon', '/gold', '/cinematic', '/product', '/productad', '/billboard', '/couponburst', '/gianttype', '/premium', '/ad'],
  producto:   ['/product', '/luxury', '/macro', '/packaging', '/flatlay', '/productad', '/360view', '/anatomy', '/heroshot', '/levitate', '/unboxing', '/ingredientflat', '/mockup', '/floating', '/splash', '/techad', '/futuristic', '/minimal', '/workspace', '/packshot', '/assemblyguide'],
  comida:     ['/food', '/flatlay', '/macro', '/goldenhour', '/chefaction', '/finedining', '/specialtycoffee', '/asadofire'],
  detras:     ['/lifestyle', '/cozy', '/cinematic', '/product', '/aerialview', '/teamwork', '/handsatwork', '/kitchenfire', '/filmstill', '/workspace'],
  testimonio: ['/quote', '/lifestyle', '/cozy', '/happyclient', '/ownerportrait', '/ugcselfie', '/ugcreview', '/ugcbeforeafter', '/ugcvideocall', '/ugchand'],
  evento:     ['/cinematic', '/neon', '/goldenhour', '/gold', '/aerialview', '/eventflyer', '/barmidnight', '/rooftopterrace', '/poster', '/action', '/night', '/gaming', '/cyberpunk', '/noir', '/mapview'],
  frase:      ['/quote', '/watercolor', '/cozy', '/polaroidframe', '/filmgrain'],
  lanzamiento:['/luxury', '/gold', '/neon', '/cinematic', '/product', '/productad', '/billboard', '/heroshot', '/unboxing', '/movieposter', '/techad', '/futuristic', '/premium'],
  tips:       ['/flatlay', '/quote', '/product', '/anatomy', '/beforeafter', '/knolling', '/infographic', '/timelapse', '/assemblyguide'],
  viral:      ['/legoify', '/miniatureworld', '/clay', '/popart', '/isometric', '/papercraft', '/actionfigure', '/dollhouse', '/crystal', '/candyversion', '/tinyhumans', '/timetravel', '/toydoll', '/sizecompare', '/popup', '/crackedopen', '/timelapse', '/ugcflash', '/ugcblurry', '/ugcstory', '/ugcmirror', '/ugcunboxing', '/ugcbackstage', '/ugcpet', '/ugcfloor', '/ugcdesk', '/ugccar'],
  anuncio:    ['/billboard', '/cinematic', '/neon', '/popart', '/productad', '/movieposter', '/magad', '/neonsign', '/transitad', '/poster', '/ad', '/magazine', '/branding', '/reelcover', '/thumbnail'],
  educativo:  ['/anatomy', '/360view', '/flatlay', '/quote', '/knolling', '/beforeafter', '/infographic', '/timelapse', '/assemblyguide'],
  local_venue:['/aerialview', '/goldenhour', '/cozy', '/cinematic', '/storefront', '/droneexterior', '/nightglow', '/drone', '/mapview', '/weatherchange'],
  temporada:  ['/xmaswarm', '/blackfriday', '/summerheat', '/halloweenspook', '/valentinered', '/newyearglow', '/parentsday', '/weatherchange'],
  retrato:    ['/studiportrait', '/candidmoment', '/ownerportrait', '/teamwork', '/bweditorial'],
};

const INTENT_PHRASE = {
  promo: 'es una promo', producto: 'presentás un producto', comida: 'es plato del día / comida',
  detras: 'mostrás el detrás de escena', testimonio: 'es un testimonio', evento: 'es un evento',
  frase: 'es una frase', lanzamiento: 'es un lanzamiento', tips: 'es contenido de tips',
  viral: 'buscás algo divertido que se comparta',
  anuncio: 'es un anuncio importante', educativo: 'es contenido educativo',
  local_venue: 'mostrás tu local',
  temporada: 'es contenido de temporada', retrato: 'presentás personas',
};

const INTENT_KEYWORDS = [
  ['viral', ['divertido', 'divertida', 'humor', 'meme', 'viral', 'chiste', 'gracioso', 'challenge', 'reto', 'trend']],
  ['evento', ['evento', 'fiesta', 'show', 'recital', 'inauguraci', 'feria', 'workshop', 'en vivo']],
  ['frase', ['frase', 'motivacion', 'inspiraci', 'reflexi', 'quote', 'pensamiento']],
  ['testimonio', ['testimonio', 'reseña', 'review', 'opini', 'antes y despu', 'caso de', 'client']],
  ['comida', ['plato del d', 'menú', 'pizza', 'hamburguesa', 'café', 'desayuno', 'almuerzo', 'cena', 'receta', 'comida', 'trago', 'cóctel', 'cocktail', 'postre', 'torta', 'empanada', 'parrilla']],
  ['promo', ['promo', 'descuento', '%', 'off', 'sale', '2x1', 'liquidaci', 'oferta', 'cuotas']],
  ['lanzamiento', ['lanzamiento', 'novedad', 'presentamos', 'llegó lo nuevo', 'recién llegado', 'nueva colecci']],
  ['temporada', ['navidad', 'año nuevo', 'halloween', 'pascuas', 'san valentín', 'san valentin', 'black friday', 'día de la madre', 'día del padre', 'dia de la madre', 'dia del padre', 'carnaval', 'aniversario', 'verano', 'invierno', 'primavera', 'otoño']],
  ['producto', ['producto', 'en stock', 'nuevo ingreso']],
  ['detras', ['detr', 'equipo', 'proceso', 'nuestro local', 'así trabajamos', 'día a día']],
  ['retrato', ['retrato', 'quiénes somos', 'quienes somos', 'nuestro staff', 'conocé al dueño', 'conoce al dueño', 'la fundadora', 'nuestro fundador', 'foto del equipo']],
  ['educativo', ['educativo', 'cómo funciona', 'partes de', 'anatomía', 'para qué sirve', 'etapas', 'evolución', 'evolucion']],
  ['tips', ['tip', 'consejo', 'cómo', 'tutorial', 'guía', 'truco', 'error que', 'paso a paso', 'guía de armado', 'guia de armado', 'cómo armar', 'como armar']],
  ['anuncio', ['anuncio', 'publicidad', 'cartel gigante', 'vía pública', 'gran cartel']],
  ['local_venue', ['sucursal', 'dirección', 'direcci', 'barrio', 'dónde estamos', 'vista aérea del local', 'drone del local', 'nuestra ubicación', 'mapa', 'cómo llegar', 'como llegar', 'ruta', 'dónde queda', 'donde queda']],
];

const TIPO_TO_INTENT = { promo: 'promo', tip: 'tips', social: 'testimonio', detras: 'detras', novedad: 'lanzamiento' };

// Intención EXPLÍCITA desde el generador: el `tipo` de la idea (promo, tip,
// social, detras, novedad) es una señal determinista — el generador YA SABE
// qué tipo de posteo está armando cuando escribe el caption. No se adivina.
function intentFromTipo(tipo) {
  return TIPO_TO_INTENT[String(tipo || '').toLowerCase()] || null;
}

// Estilos fantasía: la lista de 'viral' SIN los UGC (que son fotos reales
// brandSafe, no fantasía). Solo salen con intención viral o elección manual —
// las reglas negativas los bloquean donde no corresponden.
const FANTASY_STYLES = INTENT_STYLES.viral.filter(c => !String(c).startsWith('/ugc'));

// ---------- Reglas negativas: combinaciones que NUNCA salen ----------
// Cada regla aplica si (sin `rubros` o el rubro/nombre matchea) Y
// (sin `intents` o la intención matchea) Y (la intención no está en
// `exceptIntents`). Son de sentido común comercial, no de gusto.
const NEVER_STYLES = [
  { id: 'funeraria-fiesta', rubros: ['funeraria', 'funebre', 'fúnebre', 'sepelio'],
    styles: ['/neon', '/cyberpunk', '/gaming', '/neonsign', '/popart', '/candyversion', '/halloweenspook'],
    reason: 'una funeraria nunca sale con estética de fiesta' },
  { id: 'salud-envejecer', rubros: ['salud', 'clinica', 'clínica', 'odontolog', 'dental', 'medic', 'kinesiol'],
    styles: ['/aging', '/agingeffect', '/timetravel'],
    reason: 'en salud, mostrar envejecimiento o deterioro es ofensivo' },
  { id: 'belleza-envejecer', rubros: ['belleza', 'estetica', 'estética', 'peluqueria', 'peluquería', 'barberia', 'barbería', 'spa', 'nails'],
    styles: ['/aging', '/agingeffect', '/timetravel'],
    reason: 'en belleza, mostrar envejecimiento rompe la promesa del servicio' },
  { id: 'mascotas-sufrir', rubros: ['mascota', 'veterinaria', 'pet ', 'petshop'],
    styles: ['/aging', '/agingeffect', '/timetravel', '/crackedopen'],
    reason: 'con mascotas no se juega con envejecer, romper o deteriorar' },
  { id: 'profesionales-fantasia', rubros: ['abogad', 'contador', 'escriban', 'notari', 'estudio juridico', 'estudio contable'],
    exceptIntents: ['viral'], styles: FANTASY_STYLES,
    reason: 'un estudio profesional no sale en fantasía (salvo viral explícito)' },
  { id: 'educacion-oscuro', rubros: ['educacion', 'educación', 'colegio', 'escuela', 'jardin', 'jardín', 'instituto', 'curso'],
    styles: ['/noir', '/cyberpunk', '/action'],
    reason: 'educación no va con estética oscura o agresiva' },
  { id: 'inmobiliaria-devaluar', rubros: ['inmobiliaria', 'inmueble', 'real estate'],
    styles: ['/aging', '/agingeffect', '/timetravel', '/crackedopen'],
    reason: 'una propiedad nunca se muestra envejecida, deteriorada o rota' },
  { id: 'testimonio-fantasia', intents: ['testimonio'],
    styles: FANTASY_STYLES,
    reason: 'un testimonio tiene que verse real para ser creíble' },
  { id: 'retrato-fantasia', intents: ['retrato'], exceptIntents: ['viral'],
    styles: FANTASY_STYLES,
    reason: 'el retrato del dueño/equipo se muestra real (salvo viral explícito)' },
  { id: 'tecnologia-artesanal', rubros: ['tecnologia', 'tecnología', 'software', 'saas', 'tech '],
    styles: ['/clay', '/papercraft', '/watercolor', '/popup'],
    reason: 'tech no sale con estética artesanal que lo abarata' },
  { id: 'autos-romper', rubros: ['auto', 'concesionaria', 'mecanico', 'mecánico', 'taller'],
    styles: ['/crackedopen', '/aging', '/agingeffect'],
    reason: 'un auto no se muestra roto ni envejecido' },
  { id: 'religion-fiesta', rubros: ['iglesia', 'parroquia', 'templo', 'religi'],
    styles: ['/neon', '/cyberpunk', '/gaming', '/popart', '/halloweenspook'],
    reason: 'una institución religiosa no sale con estética de fiesta' },
];

function neverRuleApplies(rule, { intent, rubro, businessName } = {}) {
  const hay = `${rubro || ''} ${businessName || ''}`.toLowerCase();
  const rubroOk = !rule.rubros || rule.rubros.some(r => hay.includes(String(r).toLowerCase()));
  const intentOk = !rule.intents || rule.intents.includes(intent);
  const exceptOk = !rule.exceptIntents || !rule.exceptIntents.includes(intent);
  return rubroOk && intentOk && exceptOk;
}

// Estilos prohibidos para este contexto (con motivo). Solo incluye códigos
// que existen en la librería.
function forbiddenStyles({ intent, rubro, businessName } = {}) {
  const out = [];
  const seen = new Set();
  for (const rule of NEVER_STYLES) {
    if (!neverRuleApplies(rule, { intent, rubro, businessName })) continue;
    for (const code of rule.styles) {
      if (seen.has(code) || !getStyle(code)) continue;
      seen.add(code);
      out.push({ code, reason: rule.reason });
    }
  }
  return out;
}

function detectIntentKeywords({ theme = '', angle = '' } = {}) {
  const text = `${theme} ${angle}`.toLowerCase();
  for (const [intent, kws] of INTENT_KEYWORDS) {
    if (kws.some(k => text.includes(k))) return intent;
  }
  return null;
}

function detectIntent({ tipo = '', theme = '', angle = '' } = {}) {
  return detectIntentKeywords({ theme, angle })
    || TIPO_TO_INTENT[String(tipo || '').toLowerCase()]
    || 'producto';
}
// Lo que el generador SABE (no adivina): la intención explícita que viaja al
// motor de estilos. El refinamiento por keywords (meme→viral, plato del
// día→comida) le gana al tipo grueso porque es más específico; el tipo es el
// fallback determinista. Si no hay señal → null (el motor usa su default).
function resolveExplicitIntent({ tipo = '', theme = '', angle = '' } = {}) {
  const fromKw = detectIntentKeywords({ theme, angle });
  if (fromKw) return { intent: fromKw, source: 'keywords' };
  const fromTipo = intentFromTipo(tipo);
  if (fromTipo) return { intent: fromTipo, source: 'tipo' };
  return { intent: null, source: null };
}
// De dónde vino la intención resuelta (para el log/motivo). No cambia
// detectIntent: solo etiqueta el camino que ya tomó.
function intentSourceOf({ tipo = '', theme = '', angle = '' } = {}, resolved) {
  const text = `${theme} ${angle}`.toLowerCase();
  if (INTENT_KEYWORDS.some(([, kws]) => kws.some(k => text.includes(k)))) return 'keywords';
  if (intentFromTipo(tipo)) return 'tipo';
  return 'default';
}

function rubroMatch(style, rubro) {
  const r = String(rubro || '').toLowerCase().trim();
  if (!r) return false;
  return (style.rubros || []).some(x => r.includes(x) || x.includes(r));
}

// ---------- (v233) Familia de dirección de un preset ----------
// La gramática visual del preset (la misma taxonomía de familias que la
// dirección de arte del demo): dos piezas con presets distintos pero de
// la MISMA familia se leen como el mismo look — la rotación semanal es
// por familia, no solo por código. Mapa exacto para los códigos
// principales + fallback por vocabulario (código/nombre/prompt).
const STYLE_FAMILY_BY_CODE = {
  '/flatlay': 'flatlay', '/knolling': 'flatlay', '/ingredientflat': 'flatlay', '/anatomy': 'flatlay', '/arch-pastelflatlay': 'flatlay',
  '/product': 'studio', '/packshot': 'studio', '/productad': 'studio', '/premium': 'studio', '/mockup': 'studio', '/360view': 'studio', '/heroshot': 'studio', '/arch-whitepackshot': 'studio', '/arch-beigeminimal': 'studio',
  '/macro': 'macro',
  '/levitate': 'levitation', '/floating': 'levitation', '/splash': 'levitation', '/packaging': 'levitation',
  '/cinematic': 'cinematic', '/movieposter': 'cinematic', '/billboard': 'cinematic', '/neon': 'cinematic', '/ad': 'cinematic', '/arch-gymdark': 'cinematic',
  '/luxury': 'luxury', '/gold': 'luxury', '/luxedark': 'luxury',
  '/popart': 'pop', '/gianttype': 'pop', '/couponburst': 'pop', '/poster': 'pop', '/infographic': 'pop', '/arch-infographic': 'pop', '/arch-fashioneditorial': 'pop', '/arch-meme': 'pop',
  '/lifestyle': 'lifestyle', '/cozy': 'lifestyle', '/happyclient': 'lifestyle', '/ownerportrait': 'lifestyle', '/ugcselfie': 'lifestyle', '/ugcreview': 'lifestyle', '/ugchand': 'lifestyle', '/ugcvideocall': 'lifestyle', '/arch-founder': 'lifestyle', '/arch-ugcraw': 'lifestyle', '/arch-warmfood': 'lifestyle',
  '/beforeafter': 'duo_split', '/ugcbeforeafter': 'duo_split',
  '/quote': 'typo',
  '/techad': 'tech', '/futuristic': 'tech',
  '/unboxing': 'action', '/timelapse': 'action', '/assemblyguide': 'action', '/workspace': 'action', '/chefaction': 'action', '/handsatwork': 'action',
  '/branding': 'corporate',
  '/carousel': 'carousel', '/carrusel': 'carousel',
  '/clay': 'miniature', '/legoify': 'miniature', '/miniatureworld': 'miniature', '/papercraft': 'miniature', '/isometric': 'miniature', '/actionfigure': 'miniature', '/dollhouse': 'miniature', '/crystal': 'miniature', '/candyversion': 'miniature', '/popup': 'miniature', '/toydoll': 'miniature', '/tinyhumans': 'miniature', '/arch-mascot3d': 'miniature', '/arch-foodmascot': 'miniature',
};
function styleFamilyOf(style) {
  const s = typeof style === 'string' ? getStyle(style) : style;
  const code = String((s && s.code) || (typeof style === 'string' ? style : '') || '').toLowerCase();
  if (code && STYLE_FAMILY_BY_CODE[code]) return STYLE_FAMILY_BY_CODE[code];
  const t = `${code} ${String((s && s.name) || '').toLowerCase()} ${String((s && s.prompt) || '').toLowerCase()}`;
  if (/carousel|carrusel/.test(t)) return 'carousel';
  if (/before/.test(t) && /after|despu/.test(t)) return 'duo_split';
  if (/flat[ -]?lay|knolling|cenital|top[ -]?down/.test(t)) return 'flatlay';
  if (/macro|close[ -]?up|detalle extremo/.test(t)) return 'macro';
  if (/levitat|floating|flot|splash/.test(t)) return 'levitation';
  if (/cinematic|cinematogr|movie|film|noir|neon|billboard|cartelera/.test(t)) return 'cinematic';
  if (/luxury|lujo|gold|premium elegant|elegante oscuro/.test(t)) return 'luxury';
  if (/pop|poster|póster|infographic|infograf|graphic|gr[aá]fic|collage|magazine|revista|editorial/.test(t)) return 'pop';
  if (/quote|frase|tipograf|typograph/.test(t)) return 'typo';
  if (/tech|futur|digital|cyber/.test(t)) return 'tech';
  if (/unboxing|assembly|timelapse|workspace|escritorio|hands at work|manos/.test(t)) return 'action';
  if (/ugc|lifestyle|estilo de vida|cozy|acogedor|client|owner|portrait|retrato|candid/.test(t)) return 'lifestyle';
  if (/brand|corpor|identidad|oficina|office|juntas|lobby|jur[ií]d|legal|biblioteca|consult|profes|prof-/.test(t)) return 'corporate';
  if (/clay|lego|miniatur|papercraft|paper|isometric|toy|doll|diorama|mascot/.test(t)) return 'miniature';
  if (/product|packshot|studio|estudio|mockup|hero|catalog|cat[aá]logo/.test(t)) return 'studio';
  return 'premium_generic';
}

// ---------- (v233) Match léxico preset ↔ digest del cliente ----------
// LOS PROMPTS DE VALENTINO MANDAN: el preset se elige consciente del
// fundamento — un preset cuyo texto (código/nombre/prompt) nombra los
// productos/servicios/temas REALES del negocio puntúa por match léxico
// contra las ANCLAS del digest (client-digest.anchorsOf). Las palabras
// se derivan del TEXTO del ancla sin excluir el nombre del negocio
// (a diferencia del chequeo de pertenencia de captions, acá "sushi" en
// "Sushi Go" SÍ describe el mundo del cliente y tiene que poder
// matchear el preset /sushiart). Puntaje: frase completa del ancla en
// el texto del preset = 3; cada palabra distintiva presente = 1;
// tope 8. Los filtros duros (brandSafe / NEVER_STYLES) se aplican
// ANTES y este match jamás los revierte: solo ordena entre válidos.
const DIGEST_MATCH_MIN = 2;
const DIGEST_MATCH_WEIGHT = 250;
const DIGEST_MATCH_CAP = 8;
let _cd = null;
function clientDigestMod() {
  if (_cd === null) { try { _cd = require('./client-digest'); } catch (e) { _cd = false; } }
  return _cd || null;
}
function matchAgainstAnchors(style, anchors) {
  const cd = clientDigestMod();
  if (!cd || !style || !Array.isArray(anchors) || !anchors.length) return { points: 0, words: [] };
  const text = cd.norm(`${style.code || ''} ${style.name || ''} ${style.prompt || ''}`);
  const textWords = cd.textWordSet(text);
  const matched = new Set();
  let phraseHits = 0;
  for (const a of anchors) {
    if (a.phrase && a.phrase.split(' ').length >= 2 && text.includes(a.phrase)) { phraseHits++; continue; }
    for (const w of cd.distinctiveWords(a.text)) {
      if (matched.has(w)) continue;
      for (const f of cd.wordForms(w)) { if (textWords.has(f)) { matched.add(w); break; } }
    }
  }
  return { points: Math.min(DIGEST_MATCH_CAP, phraseHits * 3 + matched.size), words: [...matched] };
}
function digestStyleMatch(style, digest) {
  const cd = clientDigestMod();
  if (!cd || !digest) return { points: 0, words: [] };
  let anchors = [];
  try { anchors = cd.anchorsOf(digest); } catch (e) { return { points: 0, words: [] }; }
  return matchAgainstAnchors(style, anchors);
}

// pickStyle({ intent, tipo, theme, angle, rubro, businessName, usedThisWeek, digest, avoidFamilies }) → { style, reason, intent, intentSource, family, digestMatch } | null
// La INTENCIÓN puede viajar EXPLÍCITA desde el generador. Precedencia:
//   1) `intent` explícito válido → se usa directo ('explicit')
//   2) detectIntent por keywords del tema/ángulo ('keywords') — el refinamiento
//      fino (meme→viral, plato del día→comida) le gana al tipo grueso
//   3) intent determinista desde `tipo` (intentFromTipo) ('tipo')
//   4) default 'producto' ('default')
// Las reglas NEVER_STYLES filtran combinaciones prohibidas en TODOS los pools.
// La fantasía solo sale si la intención es 'viral'.
// Prioridad de candidatos: 1) intención + rubro · 2) rubro brandSafe ·
// 3) intención · 4) cualquiera brandSafe. (En viral se salta el 2.)
function pickStyle({ intent = null, tipo = '', theme = '', angle = '', rubro = '', businessName = '', usedThisWeek = [], boosts = {}, favorites = [], digest = null, avoidFamilies = [] } = {}) {
  let resolved, intentSource;
  if (intent && INTENT_STYLES[intent]) { resolved = intent; intentSource = 'explicit'; }
  else {
    resolved = detectIntent({ tipo, theme, angle });
    intentSource = intentSourceOf({ tipo, theme, angle }, resolved);
  }
  const ranked = (INTENT_STYLES[resolved] || []).map(getStyle).filter(Boolean);
  const used = new Set((usedThisWeek || []).map(String));
  const forbidden = new Set(forbiddenStyles({ intent: resolved, rubro, businessName }).map(f => f.code));
  const fantasyOk = resolved === 'viral';
  // No repetir en la semana: se prefieren estilos no usados; si no queda
  // ninguno libre, se permite repetir (mejor que no generar).
  const pool = ranked.filter(s => (fantasyOk || s.brandSafe) && !forbidden.has(s.code));
  const matchesRubro = (s) => rubroMatch(s, rubro);
  const intentRubro = pool.filter(s => matchesRubro(s) && !used.has(s.code));
  const rubroSafe = STYLES.filter(s => s.brandSafe && matchesRubro(s) && !used.has(s.code) && !forbidden.has(s.code));
  const intentOnly = pool.filter(s => !used.has(s.code));
  const anySafe = STYLES.filter(s => s.brandSafe && !used.has(s.code) && !forbidden.has(s.code));
  const fallbackSafe = STYLES.filter(s => s.brandSafe && !forbidden.has(s.code));
  const cands = intentRubro.length ? intentRubro
    : (!fantasyOk && rubroSafe.length) ? rubroSafe
    : intentOnly.length ? intentOnly
    : anySafe.length ? anySafe
    : fallbackSafe;
  // (v233) PICK CONSCIENTE DEL DIGEST: las anclas del negocio puntúan
  // cada candidato (match léxico contra su texto) y los presets del
  // rubro que nombran los productos/servicios reales del cliente —
  // aunque no estén en el ranking por intención — ENTRAN al pool si el
  // match es fuerte (≥ DIGEST_MATCH_MIN). Sin digest (o sin anclas) el
  // comportamiento es idéntico al histórico: mismo pool, mismo score.
  let dAnchors = null;
  try { const cd = clientDigestMod(); if (cd && digest) dAnchors = cd.anchorsOf(digest); } catch (e) { dAnchors = null; }
  const matchCache = new Map();
  const matchFor = (s) => {
    if (!dAnchors || !dAnchors.length) return { points: 0, words: [] };
    if (!matchCache.has(s.code)) matchCache.set(s.code, matchAgainstAnchors(s, dAnchors));
    return matchCache.get(s.code);
  };
  const mergedCodes = new Set();
  let all = cands;
  if (dAnchors && dAnchors.length) {
    const inPool = new Set(cands.map((s) => s.code));
    const merged = STYLES.filter((s) => (fantasyOk || s.brandSafe) && !forbidden.has(s.code)
      && !used.has(s.code) && rubroMatch(s, rubro) && !inPool.has(s.code)
      && matchFor(s).points >= DIGEST_MATCH_MIN);
    if (merged.length) {
      for (const s of merged) mergedCodes.add(s.code);
      all = [...cands, ...merged];
    }
  }
  // (v233) ROTACIÓN DE FAMILIA: si la semana ya usó familias de
  // dirección, los candidatos de esas familias quedan fuera (la
  // variedad es de gramática visual, no solo de preset). Si el filtro
  // vaciara el pool, se ignora: mejor repetir familia que no generar.
  const avoidFam = new Set((avoidFamilies || []).map(String));
  if (avoidFam.size) {
    const kept = all.filter((s) => !avoidFam.has(styleFamilyOf(s)));
    if (kept.length) all = kept;
  }
  // Learning loop: el boost SOLO reordena dentro del pool ya validado
  // (brandSafe + NEVER_STYLES se filtraron arriba; el boost jamás los revierte).
  // Peso 120: un favorito probado del cliente (+1.0) supera al #1 genérico,
  // pero no arrastra un #5 al tope — el ranking por intención sigue mandando.
  const learnBoost = (code) => {
    const v = Number((boosts || {})[code]);
    if (!Number.isFinite(v)) return 0;
    return Math.max(-0.5, Math.min(1, v));
  };
  // Favoritos del cliente (v186, elegidos en Ajustes con vista previa):
  // ordenan PRIMERO dentro del pool ya validado — un favorito prohibido o
  // ya usado esta semana no está en cands y jamás resucita por esta vía.
  const favSet = new Set((favorites || []).map(String));
  // El match del digest pesa como ~2,5 posiciones del ranking por
  // punto: un preset que nombra el producto real del cliente le gana
  // al genérico de la intención. Los que entraron por el merge del
  // digest parten de un índice virtual 2 (detrás del podio genérico,
  // pero su match los levanta); el resto conserva el índice -1
  // histórico de los pools de rubro. Desempate: mayor match primero.
  const scored = all
    .map((s) => {
      const m = matchFor(s);
      const ri = ranked.indexOf(s);
      const idx = ri >= 0 ? ri : (mergedCodes.has(s.code) ? 2 : -1);
      return { s, m, score: idx * 100 + (matchesRubro(s) ? 0 : 10) - learnBoost(s.code) * 120 - (favSet.has(s.code) ? 100000 : 0) - m.points * DIGEST_MATCH_WEIGHT };
    })
    .sort((a, b) => (a.score - b.score) || (b.m.points - a.m.points));
  const chosen = scored.length ? scored[0].s : null;
  if (!chosen) return null;
  const chosenMatch = matchFor(chosen);
  return {
    style: chosen,
    reason: `elegí ${chosen.code} porque ${INTENT_PHRASE[resolved] || 'va con el posteo'}${chosenMatch.points >= DIGEST_MATCH_MIN && chosenMatch.words.length ? ` · matchea con su negocio (${chosenMatch.words.slice(0, 3).join(', ')})` : ''}`,
    intent: resolved,
    intentSource,
    family: styleFamilyOf(chosen),
    digestMatch: chosenMatch,
  };
}

// Fragmento de dirección de estilo del preset. (v233) En la generación
// de posteos lo inserta assembleImagePrompt en la posición de
// DIRECCIÓN DE ESTILO (tras composición/paleta, antes de HEADLINE
// ZONE) — ya no es el apéndice final. La línea de supremacía de paleta
// es innegociable: el estilo jamás cambia los colores de marca.
function styleFragment(style, paletteHex) {
  const s = typeof style === 'string' ? getStyle(style) : style;
  if (!s) return '';
  const hexes = Array.isArray(paletteHex) ? paletteHex.filter(Boolean) : [];
  return [
    `STYLE DIRECTION (${s.code} — ${s.name}): ${s.prompt}`,
    hexes.length
      ? `PALETTE SUPREMACY: keep the brand colors EXACT (${hexes.join(', ')}) integrated into the scene — props, wardrobe, packaging, environment details. The style must NEVER change, replace or reinterpret the brand colors.`
      : `PALETTE SUPREMACY: keep the client's brand palette exactly as defined — the style must NEVER change the brand colors.`,
  ].join('\n');
}

module.exports = { STYLES, BY_CODE, getStyle, listStyles, INTENT_STYLES, INTENT_PHRASE, detectIntent, detectIntentKeywords, resolveExplicitIntent, intentFromTipo, FANTASY_STYLES, NEVER_STYLES, forbiddenStyles, pickStyle, styleFragment, rubroMatch, styleFamilyOf, digestStyleMatch, DIGEST_MATCH_MIN, DIGEST_MATCH_WEIGHT };
