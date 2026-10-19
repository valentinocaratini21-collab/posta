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

// ---------- (v234) SELECCIÓN QUE SABE: dataset de selección ----------
// prompt-selection-map.json — la clasificación de los 1.267 presets del
// estudio de selección (2026-10-18): por code, gramática (familia, tono,
// temperatura…), negocio ideal (rubros_gana, oferta, posicionamiento),
// intención de VENTA que cubre (la taxonomía del cerebro comercial),
// kinds, líneas de feed compatibles y las que ROMPE, contraindicaciones
// duras (exige-local/envasado/producto/protagonista, UGC en premium…)
// y prioridad. Es un insumo de pickStyle: filtros duros nuevos antes
// del score y términos de score del dataset (ver pickStyle). Si el
// archivo no está o un code no existe en el mapa, el comportamiento
// para ese code es IDÉNTICO a v233 (degradación segura).
let SELECTION_MAP = null;
try {
  const m = require('./prompt-selection-map.json');
  if (m && typeof m === 'object' && Object.keys(m).length) SELECTION_MAP = m;
} catch (e) { SELECTION_MAP = null; }
function selectionFor(code) {
  if (!SELECTION_MAP || !code) return null;
  return SELECTION_MAP[String(code)] || null;
}

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

// (v235) ALIAS DE RUBRO: el catálogo y los perfiles históricos hablan
// dialectos distintos ('ropa' en profiles viejos, 'restaurante'/
// 'florería'/'peluquería' en tags de presets…). El alias se resuelve en
// LA FUENTE (catMap de server.js ya siembra 'moda') y acá como red para
// las filas ya guardadas: el pool de moda NUNCA más vacío por un nombre.
const RUBRO_ALIASES = {
  ropa: 'moda', indumentaria: 'moda', restaurante: 'gastronomia',
  floreria: 'flores', cosmetica: 'belleza', estetica: 'belleza',
  peluqueria: 'belleza', veterinaria: 'mascotas', gimnasio: 'fitness',
  pasteleria: 'cafeteria', panaderia: 'cafeteria', parrilla: 'gastronomia',
  pizzeria: 'gastronomia', vivero: 'flores', odontologia: 'salud',
  cerveceria: 'bar',
};
function aliasRubro(r) {
  const x = String(r || '').toLowerCase().trim();
  return RUBRO_ALIASES[x] || x;
}
function rubroMatch(style, rubro) {
  // (v237) Normalización de acentos: las categorías reales de los
  // perfiles llegan CON acento ('gastronomía', 'cafetería',
  // 'peluquería') y los rubros del catálogo van sin acento — sin
  // quitar diacríticos, el match léxico fallaba en silencio y el pick
  // caía a pools genéricos (medido: un sushi y una parrilla elegían
  // el mismo preset de neón). Se normalizan AMBOS lados.
  const r = String(rubro || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!r) return false;
  const forms = new Set([r, aliasRubro(r)]);
  return (style.rubros || []).some((x0) => {
    const x = String(x0 || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const xf = [x, aliasRubro(x)];
    for (const a of forms) for (const b of xf) { if (a && b && (a.includes(b) || b.includes(a))) return true; }
    return false;
  });
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

// ---------- (v234) Perfiles que el dataset consume, desde el digest ----------
// feedProfile: la LÍNEA del feed del cliente (qué líneas de feed rompe
// un preset es un filtro duro SOLO si el feed está consolidado —
// `confident`). Señales, en orden de fuerza: el registro medido del
// feed ('light'|'dark' que ya calculan la prueba y el digest), el color
// de FONDO de la paleta con roles, la luminancia media extrema de la
// paleta, la temperatura/saturación de los colores saturados y el
// patrón de grilla (columnas con tono consistente) si el llamador lo
// pasa en opts.gridPattern. Sin señal confiable de tono no se inventa
// ninguna: `confident=false` y el filtro de feed no corre (el término
// de score por compatibilidad sí puede aplicar con las líneas que haya).
function hexToHsl(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}
// HSV: la saturación HSL explota en los tintes casi blancos (un crema
// cálido da s≈1), así que temperatura/saturación/sobriedad del feed se
// miden en HSV, donde un fondo crema ES poco saturado (s≈0,14).
function hexToHsv(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  const s = mx === 0 ? 0 : d / mx;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (mx === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, v: mx };
}
function feedProfileFromDigest(digest, opts = {}) {
  const registro = opts.registro || (digest && digest.registro) || null;
  if (!digest && !registro && !opts.gridPattern) return null;
  const lineas = [];
  const push = (l) => { if (l && !lineas.includes(l)) lineas.push(l); };
  if (registro === 'light') push('luminoso');
  if (registro === 'dark') push('oscuro');
  let fondoLum = null;
  const hues = [], sats = [], lums = [], satsAll = [];
  const pal = (digest && Array.isArray(digest.paleta)) ? digest.paleta : [];
  for (const p of pal) {
    const hsl = hexToHsl(p && p.hex);
    const hsv = hexToHsv(p && p.hex);
    if (!hsl || !hsv) continue;
    lums.push(hsl.l);
    satsAll.push(hsv.s);
    const rol = String((p && p.rol) || '').toLowerCase();
    if (rol === 'fondo' || rol === 'background') fondoLum = hsl.l;
    if (hsv.s > 0.15) { hues.push(hsv.h); sats.push(hsv.s); }
  }
  if (fondoLum != null) {
    if (fondoLum >= 0.62) push('luminoso');
    if (fondoLum <= 0.35) push('oscuro');
  } else if (lums.length) {
    const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
    if (mean >= 0.70) push('luminoso');
    if (mean <= 0.30) push('oscuro');
  }
  if (hues.length) {
    const warm = hues.filter((h) => h <= 70 || h >= 330).length;
    const cool = hues.filter((h) => h >= 160 && h <= 295).length;
    if (warm / hues.length >= 0.6 && warm > cool) push('calido');
    else if (cool / hues.length >= 0.6 && cool > warm) push('frio');
    const ms = sats.reduce((a, b) => a + b, 0) / sats.length;
    if (ms >= 0.55) push('saturado');
  }
  // Sobrio: paleta entera apagada (saturación HSV media ≤0,16) — la
  // línea que rompe un preset saturado en un taller o una funeraria.
  if (satsAll.length >= 2 && satsAll.reduce((a, b) => a + b, 0) / satsAll.length <= 0.16) push('sobrio');
  // Minimalista: fondo casi blanco y paleta corta (≤3 colores).
  if (fondoLum != null && fondoLum >= 0.93 && pal.length >= 1 && pal.length <= 3) push('minimalista');
  let gridTone = null;
  const gp = opts.gridPattern;
  if (gp && Array.isArray(gp.columns)) {
    const tones = gp.columns.map((c) => c && c.tone).filter(Boolean);
    const cl = tones.filter((t) => t === 'claro').length;
    const os = tones.filter((t) => t === 'oscuro').length;
    if (cl >= 2 && cl > os) gridTone = 'claro';
    if (os >= 2 && os > cl) gridTone = 'oscuro';
    if (gridTone === 'claro') push('luminoso');
    if (gridTone === 'oscuro') push('oscuro');
  }
  const confident = !!(registro || fondoLum != null || gridTone);
  return { lineas, confident };
}
// offerProfile: qué TIENE el negocio para que los presets que EXIGEN
// algo no caigan donde eso no existe. Reglas determinísticas sobre
// campos del digest (documentadas, conservadoras: ante la duda el
// filtro NO corre — tieneLocal solo es false con evidencia textual de
// "a domicilio/online", porque filtrar presets de local a un negocio
// que SÍ tiene local es peor que el status quo):
//  · tieneProducto: hay productos vendibles en el digest.
//  · tieneEnvasado: algún producto/catálogo nombra formato envasado
//    (gramos/ml, frasco, botella, lata, pote, pack…).
//  · tieneProtagonista: el digest conoce a la persona (protagonista).
//  · tieneLocal: evidencia "a domicilio/online" ⇒ false; rubro de
//    local físico o turnos con servicios ⇒ true; si no, true (default
//    conservador = el filtro exige-local no se dispara).
//  · posicionamiento: 'premium' solo con señal textual (lujo, de
//    autor, exclusivo, alta gama…); 'popular' con señal de precio
//    (económico, accesible, mayorista); si no, 'medio'.
const PACK_FORMAT_RE = /\b(100|200|250|500|750|1000)\s?(g|gr|kg|ml|l)\b|frasco|botella|lata|pote|envase|pack de|bolsa de|presentaci/i;
const NO_LOCAL_RE = /a domicilio|domicilio|100%\s*online|solo online|env[ií]os a todo/i;
const PREMIUM_SIGNAL_RE = /premium|lujo|luxury|exclusiv|alta gama|de autor|gourmet|boutique/i;
const POPULAR_SIGNAL_RE = /econ[oó]mic|accesible|barato|mayorista|low ?cost/i;
const LOCAL_CATEGORIES = new Set(['gastronomia', 'restaurante', 'cafeteria', 'bar', 'pizzeria', 'pasteleria', 'panaderia', 'cerveceria', 'parrilla', 'barberia', 'peluqueria', 'fitness', 'gimnasio', 'mascotas', 'veterinaria', 'salud', 'odontologia', 'inmobiliaria', 'autos', 'joyeria', 'flores', 'floreria', 'turismo', 'hotel']);
function offerProfileFromDigest(digest) {
  if (!digest) return null;
  const catItems = (digest.catalog && Array.isArray(digest.catalog.items)) ? digest.catalog.items : [];
  const itemNames = [...(digest.productos || []), ...catItems].map((x) => String((x && x.nombre) || ''));
  const text = `${digest.diferencial || ''} ${digest.business || ''} ${digest.subcat || ''}`;
  let tieneLocal = true;
  if (NO_LOCAL_RE.test(text)) tieneLocal = false;
  else if (LOCAL_CATEGORIES.has(String(digest.category || '').toLowerCase())) tieneLocal = true;
  else if (digest.has_booking && (digest.servicios || []).length) tieneLocal = true;
  let posicionamiento = 'medio';
  if (PREMIUM_SIGNAL_RE.test(text)) posicionamiento = 'premium';
  else if (POPULAR_SIGNAL_RE.test(text)) posicionamiento = 'popular';
  return {
    tieneLocal,
    tieneProducto: (digest.productos || []).length > 0,
    tieneEnvasado: itemNames.some((n) => PACK_FORMAT_RE.test(n)),
    tieneProtagonista: !!(digest.protagonista && String(digest.protagonista).trim()),
    posicionamiento,
  };
}
// Contraindicaciones del dataset para UN preset, por nivel de cascada:
//  · never — exigencias contra la oferta real (exige-local/envasado/
//    producto/protagonista): NUNCA se relajan ni las salta un favorito.
//  · pos — posicionamiento (UGC/gráfica agresiva en marca premium) y
//    prioridad baja del dataset: se relajan primero.
//  · feed — el preset rompe la línea del feed (solo con feed confiado):
//    se relaja después. Sin entry en el dataset → null (v233 puro).
function datasetContraFor(entry, { feedProfile = null, offerProfile = null, evidenceOk = false } = {}) {
  if (!entry) return null;
  const contra = Array.isArray(entry.contraindicaciones) ? entry.contraindicaciones : [];
  const never = [], pos = [], feed = [];
  // Antes/después sin evidencia real: un dúo generado por IA presentado
  // como resultado del negocio es un resultado fabricado (regla de
  // verdad) — fuera del automático salvo que el llamador declare
  // evidencia real del cliente (evidenceOk).
  if (contra.includes('requiere-evidencia-real-antes-despues') && !evidenceOk) never.push('sin-evidencia');
  if (offerProfile) {
    if (contra.includes('exige-local-fisico') && offerProfile.tieneLocal === false) never.push('exige-local');
    if (contra.includes('exige-producto-envasado') && offerProfile.tieneEnvasado === false) never.push('exige-envasado');
    if (contra.includes('exige-producto-fisico') && offerProfile.tieneProducto === false) never.push('exige-producto');
    if (contra.includes('exige-protagonista-humano') && offerProfile.tieneProtagonista === false) never.push('exige-protagonista');
    if (offerProfile.posicionamiento === 'premium'
      && (contra.includes('ugc-no-marca-premium') || contra.includes('grafica-agresiva-no-premium'))) pos.push('no-premium');
  }
  if (entry.prioridad === 'baja') pos.push('prioridad-baja');
  if (feedProfile && feedProfile.confident && Array.isArray(entry.feed_rompe)
    && entry.feed_rompe.some((l) => (feedProfile.lineas || []).includes(l))) feed.push('rompe-feed');
  return { never, pos, feed };
}
// Filtro en cascada sobre una lista arbitraria de estilos (lo usa el
// demo, que no pasa por pickStyle): etapa 0 = sin ninguna contra;
// etapa 1 = se relaja posicionamiento/prioridad; etapa 2 = también el
// feed; las exigencias (never) no se relajan jamás — si todo el pool
// las viola, se devuelve la lista original marcada 'historico'.
function datasetFilterList(styles, { feedProfile = null, offerProfile = null, favorites = [], evidenceOk = false } = {}) {
  const list = Array.isArray(styles) ? styles : [];
  if (!SELECTION_MAP || !list.length) return { kept: list.slice(), relaxed: null };
  const favSet = new Set((favorites || []).map(String));
  const blockedAt = (s, stage) => {
    const c = datasetContraFor(SELECTION_MAP[s.code], { feedProfile, offerProfile, evidenceOk });
    if (!c) return false;
    if (c.never.length) return true;
    if (favSet.has(s.code)) return false;
    if (stage <= 1 && c.feed.length) return true;
    if (stage <= 0 && c.pos.length) return true;
    return false;
  };
  for (const stage of [0, 1, 2]) {
    const kept = list.filter((s) => !blockedAt(s, stage));
    if (kept.length) return { kept, relaxed: stage === 0 ? null : stage === 1 ? 'posicionamiento' : 'feed' };
  }
  return { kept: list.slice(), relaxed: 'historico' };
}
// Términos de score del dataset (escala de pickStyle: MENOR gana).
// Los comparte pickStyle y, con el signo dado vuelta, pickDemoStyles.
const KIND_BY_TIPO_DS = { promo: 'promo', sorteo: 'promo', novedad: 'novedad', reserva: 'reserva', tip: 'tip', social: 'social', detras: 'social' };
function datasetScoreDelta(style, { feedProfile = null, offerProfile = null, salesIntent = '', kind = '', map = undefined } = {}) {
  const m = map === undefined ? SELECTION_MAP : map;
  const e = (m && style) ? m[style.code] : null;
  if (!e) return 0;
  let ds = 0;
  if (salesIntent && Array.isArray(e.intenciones) && e.intenciones.includes(salesIntent)) ds -= 150;
  if (feedProfile && Array.isArray(feedProfile.lineas) && feedProfile.lineas.length
    && Array.isArray(e.feed_compatible) && e.feed_compatible.some((l) => feedProfile.lineas.includes(l))) ds -= 150;
  if (offerProfile && offerProfile.posicionamiento && Array.isArray(e.posicionamiento)
    && e.posicionamiento.includes(offerProfile.posicionamiento)) ds -= 100;
  if (kind && Array.isArray(e.kinds) && e.kinds.includes(kind)) ds -= 50;
  if (e.prioridad === 'media') ds += 100;
  return ds;
}
// La familia de rotación sale del dataset cuando el code está
// clasificado (misma taxonomía que styleFamilyOf, pero asignada por
// descriptores completos, sin las trampas de substring del fallback).
function familyOfStyle(style, map) {
  // map === null → dataset deshabilitado a propósito (v233 puro);
  // map === undefined → el mapa global; un objeto → ese mapa.
  if (map === null) return styleFamilyOf(style);
  const e = (map && style && map[style.code]) || selectionFor(style && style.code);
  return (e && e.familia) || styleFamilyOf(style);
}

// ---------- (v237) EDIT_MODE: qué se puede HACER con el preset sobre
// material real del cliente ----------
// Cuando la base es una FOTO DEL CLIENTE (restyle, product-shot), no
// todo preset sirve: algunos solo existen como escena generada de cero
// y aplicarlos "sobre" su foto obliga al modelo a reconstruir el
// producto — el riesgo de infidelidad que la QA de fidelidad persigue.
// Cada preset se clasifica por su texto (y su familia/render del
// dataset) en uno de tres modos:
//   relight   — dirección de luz/grade/mood sobre el sujeto tal cual
//               está: aplicable a la foto real sin reconstruirla.
//   reframe   — recorte, fondo o superficie nueva ALREDEDOR del mismo
//               sujeto (packshot sobre fondo, flat-lay, podio): el
//               sujeto queda, cambia el marco.
//   new-scene — exige una escena construida (cartelera, póster,
//               miniatura, levitación, dúo antes/después, render no
//               fotográfico…): solo para generación de cero, JAMÁS
//               como restyle de la foto del cliente.
// El campo vive en el dataset (prompt-selection-map.json, estampado
// por la misma regla) y esta función es la fuente de verdad: si un
// code no está en el mapa o el mapa no trae el campo, se clasifica al
// vuelo con las mismas reglas documentadas. Orden de las reglas:
//   1) el campo del dataset, si existe;
//   2) familias ESTRUCTURALMENTE de redibujo (miniature/typo/
//      duo_split/carousel: miniaturas, tipografía pura, dúos,
//      multplaca) → new-scene;
//   3) render no fotográfico (3D, ilustración) → new-scene;
//   4) familia levitation (el producto flota en un espacio
//      construido) → new-scene;
//   5) vocabulario de ESCENA construida en el texto → new-scene;
//   6) familia 'pop' SOLO si el texto es gráfico (poster,
//      infografía, collage, tipografía) → new-scene; el 'pop'
//      fotográfico del dataset (p. ej. /food, foto editorial de un
//      plato) sigue de largo — no es un redibujo;
//   7) vocabulario de MARCO (fondo seamless/blanco, cenital, podio,
//      superficie) o familias flatlay/studio → reframe;
//   8) el resto → relight.
const EDIT_FAMILY_NEW_SCENE = new Set(['miniature', 'typo', 'duo_split', 'carousel']);
const EDIT_SCENE_RE = /\b(billboard|movie poster|film poster|poster|aerial|drone|storefront|cityscape|landscape|seascape|skyline|interior scene|exterior scene|diorama|venue|room scene|environment|setting|scene|unboxing|timelapse)\b/;
const EDIT_GRAPHIC_RE = /\b(poster|infographic|infograf|collage|typograph|tipograf|graphic design|illustration|ilustraci)\b/;
const EDIT_FRAME_RE = /\b(seamless|white background|plain background|solid background|studio backdrop|backdrop|flat[ -]?lay|top[ -]?down|overhead|knolling|podium|pedestal|surface|background)\b/;
function editModeOf(style, map) {
  const s = typeof style === 'string' ? getStyle(style) : style;
  if (!s) return 'new-scene';
  const m = map === undefined ? SELECTION_MAP : map;
  const e = (m && s.code) ? m[s.code] : null;
  if (e && e.edit_mode) return e.edit_mode;
  const fam = (e && e.familia) || styleFamilyOf(s);
  const t = `${s.code || ''} ${s.name || ''} ${s.prompt || ''}`.toLowerCase();
  if (EDIT_FAMILY_NEW_SCENE.has(fam)) return 'new-scene';
  if (e && e.render && e.render !== 'foto') return 'new-scene';
  if (fam === 'levitation') return 'new-scene';
  if (EDIT_SCENE_RE.test(t)) return 'new-scene';
  if (fam === 'pop' && EDIT_GRAPHIC_RE.test(t)) return 'new-scene';
  if (EDIT_FRAME_RE.test(t) || fam === 'flatlay' || fam === 'studio') return 'reframe';
  return 'relight';
}
const EDIT_MODES = ['relight', 'reframe', 'new-scene'];

// pickStyle({ intent, tipo, theme, angle, rubro, businessName, usedThisWeek, digest, avoidFamilies, feedProfile, offerProfile, salesIntent, dataset, baseReal }) → { style, reason, intent, intentSource, family, digestMatch, dataset } | null
// (v237) baseReal: la base de la pieza es material REAL del cliente
// (su foto): solo compiten presets relight/reframe (editModeOf) — un
// new-scene JAMÁS sale con base real, en ninguna etapa de la cascada.
// (v234) feedProfile/offerProfile: si no vienen, se derivan del digest.
// salesIntent: la intención de VENTA de la pieza (cerebro comercial);
// si un camino no la tiene, el término de score simplemente no aplica.
// dataset: false simula el mapa ausente (comportamiento v233 exacto).
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
function pickStyle({ intent = null, tipo = '', theme = '', angle = '', rubro = '', subrubro = '', businessName = '', usedThisWeek = [], boosts = {}, favorites = [], digest = null, avoidFamilies = [], feedProfile = null, offerProfile = null, salesIntent = '', evidenceOk = false, dataset = undefined, baseReal = false } = {}) {
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
  // (v235) El subrubro confirmado también abre el pool: un preset
  // taggeado 'peluqueria' sirve a belleza/peluqueria, uno 'sushi' a
  // gastronomia/sushi — vía el mismo rubroMatch con alias.
  const matchesRubro = (s) => rubroMatch(s, rubro) || (subrubro ? rubroMatch(s, subrubro) : false);
  const favSet = new Set((favorites || []).map(String));
  // (v234) SELECCIÓN QUE SABE: el dataset de selección entra como
  // filtros duros ANTES del score (el match léxico del digest jamás
  // resucita un contraindicado) y como términos de score. Perfiles
  // efectivos: los que pasa el llamador o los derivados del digest.
  // `dataset: false` simula el archivo ausente → v233 idéntico.
  const dsMap = dataset === false ? null : (dataset && typeof dataset === 'object' ? dataset : SELECTION_MAP);
  // El modo viral es EXPLÍCITO (fantasía deliberada, como la elección
  // manual): el dataset marca esos presets 'baja'/'solo-viral-o-manual'
  // POR CONSTRUCCIÓN (los 48 no-brandSafe) y sus filtros/score son de
  // posteo comercial — no gobiernan el viral. brandSafe/NEVER_STYLES y
  // el filtro de evidencia siguen valiendo como en v233.
  const dsActive = !!dsMap && !fantasyOk;
  const effFeed = feedProfile || (digest ? feedProfileFromDigest(digest) : null);
  const effOffer = offerProfile || (digest ? offerProfileFromDigest(digest) : null);
  const contraCache = new Map();
  const contraFor = (s) => {
    if (!dsMap) return null;
    if (!contraCache.has(s.code)) contraCache.set(s.code, datasetContraFor(dsMap[s.code], { feedProfile: effFeed, offerProfile: effOffer, evidenceOk }));
    return contraCache.get(s.code);
  };
  // Etapas de la cascada (spec del estudio §7.5): 0 = filtros del
  // dataset completos · 1 = se relaja posicionamiento/prioridad ·
  // 2 = también el feed · 3 = histórico v233. Las reglas NEVER_STYLES
  // y brandSafe valen en TODAS las etapas; las exigencias del dataset
  // (exige-*) en las etapas 0–2; el favorito explícito del cliente
  // salta posicionamiento y feed, NUNCA las exigencias.
  const blockedAt = (s, stage) => {
    if (forbidden.has(s.code)) return true;
    // (v237) Con base REAL del cliente, un preset new-scene está
    // bloqueado en TODAS las etapas (como NEVER_STYLES): un "restyle"
    // que reconstruye la escena no es un restyle. No lo salta ni el
    // favorito (el favorito ordena entre los aplicables a su foto).
    if (baseReal && editModeOf(s, dsMap) === 'new-scene') return true;
    if (!dsActive || stage >= 3) return false;
    const c = contraFor(s);
    if (!c) return false;
    if (c.never.length) return true;
    if (favSet.has(s.code)) return false;
    if (stage <= 1 && c.feed.length) return true;
    if (stage <= 0 && c.pos.length) return true;
    return false;
  };
  // Los pools de v233, parametrizados por la etapa de la cascada.
  const buildAll = (stage) => {
    const pool = ranked.filter(s => (fantasyOk || s.brandSafe) && !blockedAt(s, stage));
    const intentRubro = pool.filter(s => matchesRubro(s) && !used.has(s.code));
    const rubroSafe = STYLES.filter(s => s.brandSafe && matchesRubro(s) && !used.has(s.code) && !blockedAt(s, stage));
    const intentOnly = pool.filter(s => !used.has(s.code));
    const anySafe = STYLES.filter(s => s.brandSafe && !used.has(s.code) && !blockedAt(s, stage));
    const fallbackSafe = STYLES.filter(s => s.brandSafe && !blockedAt(s, stage));
    let cands = intentRubro.length ? intentRubro
      : (!fantasyOk && rubroSafe.length) ? rubroSafe
      : intentOnly.length ? intentOnly
      : anySafe.length ? anySafe
      : fallbackSafe;
    const mergedCodes = new Set();
    if (dAnchors && dAnchors.length) {
      const inPool = new Set(cands.map((s) => s.code));
      const merged = STYLES.filter((s) => (fantasyOk || s.brandSafe) && !blockedAt(s, stage)
        && !used.has(s.code) && rubroMatch(s, rubro) && !inPool.has(s.code)
        && matchFor(s).points >= DIGEST_MATCH_MIN);
      if (merged.length) {
        for (const s of merged) mergedCodes.add(s.code);
        cands = [...cands, ...merged];
      }
    }
    return { all: cands, mergedCodes };
  };
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
  // (v234) CASCADA: se construye el pool con los filtros completos
  // (etapa 0); si queda vacío, se relaja en orden — posicionamiento,
  // después feed, histórico al final — y la relajación queda escrita
  // en el motivo del pick (`dataset:relaxed-*`, auditable en
  // posts.style_reason).
  let built = null, relaxed = null, stageUsed = 3;
  for (const stage of [0, 1, 2, 3]) {
    const b = buildAll(stage);
    if (b.all.length) {
      built = b;
      stageUsed = stage;
      relaxed = !dsMap ? null : stage === 0 ? null : stage === 1 ? 'posicionamiento' : stage === 2 ? 'feed' : 'historico';
      break;
    }
  }
  // (v237) Con baseReal el pool puede quedar vacío si TODO el catálogo
  // aplicable fuera new-scene: se devuelve null (sin estilo) antes que
  // violar la regla — el llamador decide su respaldo.
  if (!built) return null;
  let all = built.all;
  const mergedCodes = built.mergedCodes;
  // (v234) COBERTURA DE LA INTENCIÓN DE VENTA: los pools por intención
  // de estilo son chicos (5–27) y a veces NINGÚN candidato cubre la
  // intención de venta que el cerebro comercial declaró para la pieza
  // — el término de score no puede elegir lo que no está en el pool.
  // Solo en ese caso el pool se ensancha con los presets del RUBRO
  // (misma etapa de filtros) que sí la cubren: el −150 hace el resto,
  // y un match de digest fuerte (≥1 punto = −250) le sigue ganando a
  // la cobertura — pertenencia primero, cobertura en el desempate.
  if (dsActive && salesIntent) {
    const covers = (s) => { const e = dsMap[s.code]; return !!(e && Array.isArray(e.intenciones) && e.intenciones.includes(salesIntent)); };
    if (!all.some(covers)) {
      const inAll = new Set(all.map((s) => s.code));
      const extra = STYLES.filter((s) => s.brandSafe && !used.has(s.code) && rubroMatch(s, rubro)
        && !blockedAt(s, stageUsed) && covers(s) && !inAll.has(s.code));
      if (extra.length) all = [...all, ...extra];
    }
    // Y si algún candidato cubre, la cobertura pasa a ser la capa que
    // manda: el score elige ENTRE los que cubren (preferidos los del
    // rubro o con match de digest). Medido con la sonda del estudio:
    // con los pesos puros, 39 de 56 picks sin cobertura tenían un
    // candidato limpio que SÍ cubría y perdían por acumulación de
    // términos de compatibilidad (−150 feed −100 pos −50 kind contra
    // −150 de intención) — la intención de venta es el trabajo de la
    // pieza (cerebro comercial); la compatibilidad desempata adentro.
    const coveringHere = all.filter(covers);
    if (coveringHere.length) {
      const pref = coveringHere.filter((s) => rubroMatch(s, rubro) || matchFor(s).points >= DIGEST_MATCH_MIN);
      all = pref.length ? pref : coveringHere;
    }
  }
  // (v233) ROTACIÓN DE FAMILIA: si la semana ya usó familias de
  // dirección, los candidatos de esas familias quedan fuera (la
  // variedad es de gramática visual, no solo de preset). Si el filtro
  // vaciara el pool, se ignora: mejor repetir familia que no generar.
  // (v234) La familia sale del dataset cuando el code está clasificado.
  const famOf = (s) => familyOfStyle(s, dsMap);
  const avoidFam = new Set((avoidFamilies || []).map(String));
  if (avoidFam.size) {
    const kept = all.filter((s) => !avoidFam.has(famOf(s)));
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
  // (El Set vive arriba, junto a la cascada del dataset, porque el
  // favorito también salta los filtros de posicionamiento/feed.)
  // El match del digest pesa como ~2,5 posiciones del ranking por
  // punto: un preset que nombra el producto real del cliente le gana
  // al genérico de la intención. Los que entraron por el merge del
  // digest parten de un índice virtual 2 (detrás del podio genérico,
  // pero su match los levanta); el resto conserva el índice -1
  // histórico de los pools de rubro. Desempate: mayor match primero.
  // (v234) Términos del dataset sobre la misma escala: intención de
  // venta cubierta −150 · feed compatible −150 · posicionamiento
  // alineado −100 · kind cubierto −50 · prioridad media +100.
  const dsKind = KIND_BY_TIPO_DS[String(tipo || '').toLowerCase()] || '';
  const scored = all
    .map((s) => {
      const m = matchFor(s);
      const ri = ranked.indexOf(s);
      const idx = ri >= 0 ? ri : (mergedCodes.has(s.code) ? 2 : -1);
      const ds = dsActive ? datasetScoreDelta(s, { feedProfile: effFeed, offerProfile: effOffer, salesIntent, kind: dsKind, map: dsMap }) : 0;
      return { s, m, score: idx * 100 + (matchesRubro(s) ? 0 : 10) - learnBoost(s.code) * 120 - (favSet.has(s.code) ? 100000 : 0) - m.points * DIGEST_MATCH_WEIGHT + ds };
    })
    .sort((a, b) => (a.score - b.score) || (b.m.points - a.m.points));
  const chosen = scored.length ? scored[0].s : null;
  if (!chosen) return null;
  const chosenMatch = matchFor(chosen);
  const dsNote = dsActive ? (dsMap[chosen.code] ? (relaxed ? ` · dataset:relaxed-${relaxed}` : ' · dataset:ok') : '') : '';
  return {
    style: chosen,
    reason: `elegí ${chosen.code} porque ${INTENT_PHRASE[resolved] || 'va con el posteo'}${chosenMatch.points >= DIGEST_MATCH_MIN && chosenMatch.words.length ? ` · matchea con su negocio (${chosenMatch.words.slice(0, 3).join(', ')})` : ''}${dsNote}`,
    intent: resolved,
    intentSource,
    family: famOf(chosen),
    digestMatch: chosenMatch,
    dataset: dsActive ? { applied: !!dsMap[chosen.code], relaxed } : null,
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

module.exports = { STYLES, BY_CODE, getStyle, listStyles, INTENT_STYLES, INTENT_PHRASE, detectIntent, detectIntentKeywords, resolveExplicitIntent, intentFromTipo, FANTASY_STYLES, NEVER_STYLES, forbiddenStyles, pickStyle, styleFragment, rubroMatch, styleFamilyOf, digestStyleMatch, DIGEST_MATCH_MIN, DIGEST_MATCH_WEIGHT, selectionFor, feedProfileFromDigest, offerProfileFromDigest, datasetContraFor, datasetFilterList, datasetScoreDelta, familyOfStyle, editModeOf, EDIT_MODES };
