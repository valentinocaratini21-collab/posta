// image-styles.js — Lógica de estilos de imagen de Posty ("secret codes").
// Los datos (179 presets) viven en image-styles-data.js.
// brandSafe=true → respeta producto/colores (puede salir por default).
// brandSafe=false → fantasía pura: solo con intención explícita (diversión/viral)
// o elección manual, NUNCA por default.
//
// Regla de oro: el fragmento del estilo se suma AL FINAL del prompt,
// DESPUÉS del Style Lock visual, y siempre con la línea de supremacía de
// paleta — el estilo jamás puede cambiar los colores de marca.
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

// pickStyle({ intent, tipo, theme, angle, rubro, businessName, usedThisWeek }) → { style, reason, intent, intentSource } | null
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
function pickStyle({ intent = null, tipo = '', theme = '', angle = '', rubro = '', businessName = '', usedThisWeek = [], boosts = {} } = {}) {
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
  // Learning loop: el boost SOLO reordena dentro del pool ya validado
  // (brandSafe + NEVER_STYLES se filtraron arriba; el boost jamás los revierte).
  // Peso 120: un favorito probado del cliente (+1.0) supera al #1 genérico,
  // pero no arrastra un #5 al tope — el ranking por intención sigue mandando.
  const learnBoost = (code) => {
    const v = Number((boosts || {})[code]);
    if (!Number.isFinite(v)) return 0;
    return Math.max(-0.5, Math.min(1, v));
  };
  const scored = cands
    .map((s) => ({ s, score: ranked.indexOf(s) * 100 + (matchesRubro(s) ? 0 : 10) - learnBoost(s.code) * 120 }))
    .sort((a, b) => a.score - b.score);
  const chosen = scored.length ? scored[0].s : null;
  if (!chosen) return null;
  return {
    style: chosen,
    reason: `elegí ${chosen.code} porque ${INTENT_PHRASE[resolved] || 'va con el posteo'}`,
    intent: resolved,
    intentSource,
  };
}

// Fragmento que se suma AL FINAL del prompt de gpt-image-1, DESPUÉS del
// Style Lock visual. La línea de supremacía de paleta es innegociable:
// el estilo jamás cambia los colores de marca.
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

module.exports = { STYLES, BY_CODE, getStyle, listStyles, INTENT_STYLES, INTENT_PHRASE, detectIntent, detectIntentKeywords, resolveExplicitIntent, intentFromTipo, FANTASY_STYLES, NEVER_STYLES, forbiddenStyles, pickStyle, styleFragment };
