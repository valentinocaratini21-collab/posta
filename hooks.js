// hooks.js — Motor de hooks de Posty (primera línea del caption).
//
// Objetivo: el caption SIEMPRE abre con un hook. Cero genéricos, cero clickbait barato.
//
// ---------------------------------------------------------------------------
// COMPATIBILIDAD CON CAPTION STYLE LOCK (caption-style.js)
// ---------------------------------------------------------------------------
// El hook es SOLO la primera línea. El cuerpo del caption mantiene intacta la
// voz del cliente (Caption Style Lock: tono, emojis, largo, CTA, hashtags,
// persona — todo se conserva).
//
// Las fórmulas de este archivo son neutras a propósito: no imponen tono ni
// jerga. Toman {tema} y {negocio} con las palabras del cliente (de su ficha
// NEGOCIO/VOZ, client-brief.js o de su propio caption style). El hook abre la
// puerta; el cliente habla adentro.
//
// Reglas del hook:
//  - Sin emojis, sin hashtags, sin mayúsculas gritonas.
//  - Nunca matchea BANNED_PATTERNS (anti-clickbait).
//  - Una idea, concreta, con algo real del negocio adentro.
//
// ---------------------------------------------------------------------------
// ROTACIÓN DE 8 SEMANAS
// ---------------------------------------------------------------------------
// pickHook() excluye los ids que ya se usaron (usedHookIds). Si no queda
// ninguno fresco, devuelve uno cualquiera con { reused: true }.
//
// La rotación de 8 semanas la maneja el CALLER: guardar { fecha, hook_id } por
// cada caption publicado y pasar como usedHookIds los ids usados en las
// últimas 8 semanas. El banco tiene 50 hooks (5 por intención), así que con un
// caption por día por intención hay material para ~7 semanas sin repetir; para
// 8 semanas completas, combinar intenciones o sumar hooks al banco.
//
// Interfaz:
//   HOOKS                    array de 50 { id, intents, formula, ejemplo, nota }
//   BANNED_PATTERNS          array de RegExp (anti-patrones clickbait)
//   isBanned(text)           boolean — true si el texto matchea algún anti-patrón
//   pickHook({ intent, usedHookIds }) -> hook (o { ...hook, reused: true })
//   renderHook(hook, { tema, negocio }) -> string
//   ensureCaptionOpensWithHook(caption, hookText) -> string
//   hookIntentMap()          -> { intent: [ids] }

const INTENTS = ['promo', 'tips', 'testimonio', 'lanzamiento', 'viral', 'social', 'educativo', 'comida', 'evento', 'frase'];

const HOOKS = [
  // ---- promo ----
  { id: 'h01', intents: ['promo'], formula: 'Esta semana {tema} sale menos en {negocio}: te contamos por qué', ejemplo: 'Esta semana la merienda está más barata en Café Alvear: te contamos por qué', nota: 'Urgencia honesta: el precio baja con motivo real, no con truco.' },
  { id: 'h02', intents: ['promo'], formula: 'Si te tentaba {tema}, este es el momento: en {negocio} lo bajamos de precio', ejemplo: 'Si te tentaba el curso de barista, este es el momento: en Tostado Club lo bajamos de precio', nota: 'Invitación cómplice: habla de algo que el lector ya quería.' },
  { id: 'h03', intents: ['promo'], formula: 'Hacé la cuenta: {tema} en {negocio} te sale menos que hacerlo en casa', ejemplo: 'Hacé la cuenta: el almuerzo ejecutivo en La Esquina te sale menos que hacerlo en casa', nota: 'Número concreto: invita a verificar, no a creer.' },
  { id: 'h04', intents: ['promo'], formula: 'No es liquidación ni Black Friday: {negocio} bajó {tema} porque nos sobra stock', ejemplo: 'No es liquidación ni Black Friday: Verde Tienda bajó las macetas porque nos sobra stock', nota: 'Confesión honesta: la razón del descuento es real y se dice.' },
  { id: 'h05', intents: ['promo'], formula: 'El {tema} de {negocio} sin margen de ganancia, solo hasta el domingo', ejemplo: 'El set de mate de Mates del Sur sin margen de ganancia, solo hasta el domingo', nota: 'Detrás de escena: muestra cómo piensa el negocio.' },

  // ---- tips ----
  { id: 'h06', intents: ['tips'], formula: 'Cómo elegir {tema} sin que te vendan cualquiera: la guía corta de {negocio}', ejemplo: 'Cómo elegir una campera de cuero sin que te vendan cualquiera: la guía corta de Cuero Norte', nota: 'Tips con autoridad: enseña a comprar bien, no solo a comprar acá.' },
  { id: 'h07', intents: ['tips'], formula: 'El error que casi todos cometen con {tema} (y cómo lo evitamos en {negocio})', ejemplo: 'El error que casi todos cometen con el riego de las suculentas (y cómo lo evitamos en Vivero Raíz)', nota: '"La mayoría hace X mal": corrige sin humillar.' },
  { id: 'h08', intents: ['tips'], formula: '3 señales de que tu {tema} ya está pidiendo cambio, según {negocio}', ejemplo: '3 señales de que tu colchón ya está pidiendo cambio, según Descanso Ideal', nota: 'Número concreto: lista corta y chequeable.' },
  { id: 'h09', intents: ['tips'], formula: 'Lo que aprendimos después de años haciendo {tema} en {negocio}', ejemplo: 'Lo que aprendimos después de años haciendo pan de masa madre en Horno de Barrio', nota: 'Confesión de oficio: la experiencia como credencial.' },
  { id: 'h10', intents: ['tips'], formula: 'Antes de comprar {tema}, fijate en esto: lo recomienda {negocio}', ejemplo: 'Antes de comprar una bici usada, fijate en esto: lo recomienda Rodados Sur', nota: 'Invitación cómplice: consejo de amigo, no de vendedor.' },

  // ---- testimonio ----
  { id: 'h11', intents: ['testimonio'], formula: 'Lo que nos dijo una clienta después de probar {tema} en {negocio}', ejemplo: 'Lo que nos dijo una clienta después de probar el tratamiento capilar en Pelu ADN', nota: 'Testimonio real: la voz del cliente abre el caption.' },
  { id: 'h12', intents: ['testimonio'], formula: 'Vino por {tema} y se quedó por el trato: la reseña que nos alegró en {negocio}', ejemplo: 'Vino por un arreglo de pantalón y se quedó por el trato: la reseña que nos alegró en Taller Puntada', nota: 'Historia mínima: antes/después en dos líneas.' },
  { id: 'h13', intents: ['testimonio'], formula: 'El mensaje que nos mandaron después de {tema}, lo guardamos en {negocio}', ejemplo: 'El mensaje que nos mandaron después del catering del casamiento, lo guardamos en Sabores Casa', nota: 'Detrás de escena: muestra el mensaje real que atesoran.' },
  { id: 'h14', intents: ['testimonio'], formula: 'De escéptica a fan: lo que pasó con {tema} en {negocio}', ejemplo: 'De escéptica a fan: lo que pasó con la depilación láser en Estética Pura', nota: 'Contraste antes/después contado por el cambio de opinión.' },
  { id: 'h15', intents: ['testimonio'], formula: 'El {tema} que una clienta recomendó a sus 3 amigas (y por qué), en {negocio}', ejemplo: 'El masaje descontracturante que una clienta recomendó a sus 3 amigas (y por qué), en Espacio Calma', nota: 'Prueba social concreta: número chico y creíble, no "miles".' },

  // ---- lanzamiento ----
  { id: 'h16', intents: ['lanzamiento'], formula: 'Llegó {tema} a {negocio}: lo veníamos armando en silencio', ejemplo: 'Llegó la línea de cerámica artesanal a Tienda Nube: lo veníamos armando en silencio', nota: 'Detrás de escena: el lanzamiento como secreto bien guardado (dicho, no gritado).' },
  { id: 'h17', intents: ['lanzamiento'], formula: 'Nuevo en {negocio}: {tema}, y fuimos los primeros en probarlo', ejemplo: 'Nuevo en Librería Central: la edición ilustrada de Rayuela, y fuimos los primeros en probarlo', nota: 'Confesión: el negocio como primer fan de lo que vende.' },
  { id: 'h18', intents: ['lanzamiento'], formula: 'Probamos {tema} antes de traerlo a {negocio}: esto fue lo que nos convenció', ejemplo: 'Probamos la nueva cafetera italiana antes de traerla a Café Alvear: esto fue lo que nos convenció', nota: 'Curaduría honesta: no venden lo que no probarían.' },
  { id: 'h19', intents: ['lanzamiento'], formula: 'La primera tanda de {tema} ya está en {negocio}: cuando se acaba, se acaba', ejemplo: 'La primera tanda de alfajores de maicena ya está en Dulces Abuela: cuando se acaba, se acaba', nota: 'Urgencia honesta: stock real limitado, sin inventar escasez.' },
  { id: 'h20', intents: ['lanzamiento'], formula: 'Si te gustaba lo de antes, {tema} en {negocio} te va a gustar más: por esto', ejemplo: 'Si te gustaba la hamburguesa clásica, la smash en Burger House te va a gustar más: por esto', nota: 'Contraste antes/después: el lanzamiento mejora algo conocido.' },

  // ---- viral ----
  { id: 'h21', intents: ['viral'], formula: 'La mayoría hace {tema} mal: en {negocio} lo hacemos al revés', ejemplo: 'La mayoría riega las orquídeas mal: en Vivero Raíz lo hacemos al revés', nota: '"La mayoría hace X mal": rompe el hábito común con una vuelta propia.' },
  { id: 'h22', intents: ['viral'], formula: 'Mito roto: {tema} no funciona como te dijeron (lo probamos en {negocio})', ejemplo: 'Mito roto: el mate con yuyos no funciona como te dijeron (lo probamos en Mates del Sur)', nota: 'Mito roto: desarma una creencia con prueba propia.' },
  { id: 'h23', intents: ['viral'], formula: 'Lo que casi nadie cuenta sobre {tema}: la versión de {negocio}', ejemplo: 'Lo que casi nadie cuenta sobre el precio del café de especialidad: la versión de Tostado Club', nota: 'Curiosidad con dato: promete información incómoda pero real.' },
  { id: 'h24', intents: ['viral'], formula: 'El dato de {tema} que nos dejó pensando en {negocio}', ejemplo: 'El dato del pan de masa madre que nos dejó pensando en Horno de Barrio', nota: 'Curiosidad con dato: abre con intriga y la cierra con evidencia.' },
  { id: 'h25', intents: ['viral'], formula: 'Nosotros también creíamos esto sobre {tema}: estábamos equivocados ({negocio})', ejemplo: 'Nosotros también creíamos que el vino barato era malo: estábamos equivocados (Vinoteca Sur)', nota: 'Confesión: el negocio admite su propio error. Desarma.' },

  // ---- social ----
  { id: 'h26', intents: ['social'], formula: 'El {tema} de {negocio}, hecho con manos de acá', ejemplo: 'El pan de campo de Horno de Barrio, hecho con manos de acá', nota: 'Comunidad: orgullo local sin solemnidad.' },
  { id: 'h27', intents: ['social'], formula: 'Cada {tema} que sale de {negocio} banca a un productor local: te lo presentamos', ejemplo: 'Cada queso que sale de Almacén Criollo banca a un productor local: te lo presentamos', nota: 'Detrás de escena: la cadena de valor tiene cara y nombre.' },
  { id: 'h28', intents: ['social'], formula: 'El barrio pidió {tema} y {negocio} lo trajo: así arrancó', ejemplo: 'El barrio pidió empanadas salteñas y La Esquina lo trajo: así arrancó', nota: 'Historia de origen: el negocio escucha a su gente.' },
  { id: 'h29', intents: ['social'], formula: 'En {negocio} el {tema} se comparte: la mesa grande de los domingos', ejemplo: 'En Sabores Casa el asado se comparte: la mesa grande de los domingos', nota: 'Invitación cómplice: el ritual compartido como identidad.' },
  { id: 'h30', intents: ['social'], formula: 'Lo que pasa en {negocio} cuando alguien pide {tema} por primera vez', ejemplo: 'Lo que pasa en Vinoteca Sur cuando alguien pide un Malbec por primera vez', nota: 'Curiosidad: el momento del cliente nuevo, contado con cariño.' },

  // ---- educativo ----
  { id: 'h31', intents: ['educativo'], formula: '{tema}, explicado sin vueltas: lo que tenés que saber, por {negocio}', ejemplo: 'El seguro del auto, explicado sin vueltas: lo que tenés que saber, por Seguros Litoral', nota: 'Educativo directo: promete claridad, no humo.' },
  { id: 'h32', intents: ['educativo'], formula: 'La diferencia entre {tema} bueno y {tema} berreta, según {negocio}', ejemplo: 'La diferencia entre un cuero bueno y un cuero berreta, según Cuero Norte', nota: 'Contraste que educa: enseña a distinguir calidad.' },
  { id: 'h33', intents: ['educativo'], formula: 'Por qué {tema} cuesta lo que cuesta en {negocio}: los números, en claro', ejemplo: 'Por qué el catering por persona cuesta lo que cuesta en Sabores Casa: los números, en claro', nota: 'Número concreto: transparencia de costos como confianza.' },
  { id: 'h34', intents: ['educativo'], formula: 'Lo que casi nadie te explica sobre {tema} antes de comprarlo: {negocio} lo explica', ejemplo: 'Lo que casi nadie te explica sobre la garantía extendida antes de comprarla: Electro Hogar lo explica', nota: 'Educativo honesto: cuenta lo incómodo que otros callan.' },
  { id: 'h35', intents: ['educativo'], formula: 'La pregunta que nos hacen siempre sobre {tema}: la respondemos en {negocio}', ejemplo: 'La pregunta que nos hacen siempre sobre la masa madre: la respondemos en Horno de Barrio', nota: 'Pregunta directa: parte de una duda real de clientes.' },

  // ---- comida ----
  { id: 'h36', intents: ['comida'], formula: 'La {tema} que hacemos distinta en {negocio} (y por qué se nota)', ejemplo: 'La milanesa que hacemos distinta en La Esquina (y por qué se nota)', nota: 'Diferenciación concreta: nombra el plato y el motivo.' },
  { id: 'h37', intents: ['comida'], formula: 'Probamos 12 versiones de {tema} hasta dar con esta: {negocio}', ejemplo: 'Probamos 12 versiones de la salsa bolognesa hasta dar con esta: Sabores Casa', nota: 'Número concreto: el trabajo invisible detrás del plato.' },
  { id: 'h38', intents: ['comida'], formula: 'El ingrediente de {tema} que casi nadie usa (y nosotros sí, en {negocio})', ejemplo: 'El ingrediente del chimichurri que casi nadie usa (y nosotros sí, en La Esquina)', nota: 'Curiosidad con dato: el detalle que cambia todo.' },
  { id: 'h39', intents: ['comida'], formula: 'Antes hacíamos {tema} así; ahora, así: lo que cambió en {negocio}', ejemplo: 'Antes hacíamos la pizza así; ahora, así: lo que cambió en Pizzería Don Juan', nota: 'Contraste antes/después: evolución contada sin vergüenza.' },
  { id: 'h40', intents: ['comida'], formula: 'Si te gusta {tema}, este plato de {negocio} es para vos: te decimos por qué', ejemplo: 'Si te gusta el picante, este plato de Sabores Casa es para vos: te decimos por qué', nota: 'Invitación cómplice: segmenta por gusto, no por demografía.' },

  // ---- evento ----
  { id: 'h41', intents: ['evento'], formula: 'Este sábado {tema} en {negocio}: traé a quien quieras', ejemplo: 'Este sábado cata de vinos en Vinoteca Sur: traé a quien quieras', nota: 'Invitación directa: fecha, lugar y permiso para venir acompañado.' },
  { id: 'h42', intents: ['evento'], formula: 'Lo que pasa en {negocio} cuando juntamos {tema} y buena música', ejemplo: 'Lo que pasa en Café Alvear cuando juntamos poesía y buena música', nota: 'Curiosidad: el evento como experiencia, no como aviso.' },
  { id: 'h43', intents: ['evento'], formula: 'Quedan pocos lugares para {tema} en {negocio}: te contamos qué incluye', ejemplo: 'Quedan pocos lugares para el taller de cerámica en Tienda Nube: te contamos qué incluye', nota: 'Urgencia honesta: cupo real + detalle de qué recibe.' },
  { id: 'h44', intents: ['evento'], formula: 'El {tema} que armamos en {negocio} no es como los otros: mirá por qué', ejemplo: 'El after office que armamos en Tostado Club no es como los otros: mirá por qué', nota: 'Contraste: diferencia este evento de los genéricos.' },
  { id: 'h45', intents: ['evento'], formula: 'Detrás de escena: así se arma {tema} en {negocio}', ejemplo: 'Detrás de escena: así se arma la feria de diseño en Espacio Palermo', nota: 'Detrás de escena: el armado como contenido previo al evento.' },

  // ---- frase ----
  { id: 'h46', intents: ['frase'], formula: 'La frase que pegamos en la pared de {negocio}: "{tema}"', ejemplo: 'La frase que pegamos en la pared de la cocina: "la milanesa se hace con paciencia"', nota: 'Manifiesto: la frase como regla de la casa.' },
  { id: 'h47', intents: ['frase'], formula: 'Si {negocio} tuviera un lema, sería este: "{tema}"', ejemplo: 'Si Horno de Barrio tuviera un lema, sería este: "el pan espera a nadie, pero a todos alimenta"', nota: 'Frase de marca: resume la filosofía en una línea.' },
  { id: 'h48', intents: ['frase'], formula: 'Lo que nos dijo un cliente y se nos quedó: "{tema}" ({negocio})', ejemplo: 'Lo que nos dijo un cliente y se nos quedó: "acá se come como en casa" (Sabores Casa)', nota: 'Frase-testimonio: la mejor línea la dijo un cliente.' },
  { id: 'h49', intents: ['frase'], formula: 'Empezamos {negocio} por una idea simple: "{tema}"', ejemplo: 'Empezamos Rodados Sur por una idea simple: "que todos puedan pedalear"', nota: 'Confesión fundacional: el porqué del negocio en una frase.' },
  { id: 'h50', intents: ['frase'], formula: 'La regla de oro de {negocio}: "{tema}", siempre', ejemplo: 'La regla de oro de Pelu ADN: "salís mejor de lo que entraste", siempre', nota: 'Regla de oro: promesa corta que se puede verificar.' },
];

// Anti-patrones clickbait: regex case-insensitive. Ningún hook del banco los usa.
const BANNED_PATTERNS = [
  /¿sabías que/i,
  /¡atención!/i,
  /no te lo pierdas/i,
  /el secreto mejor guardado/i,
  /última oportunidad/i,
  /no vas a creer/i,
  /esto te va a volar la cabeza/i,
  /leé hasta el final/i,
  /te apuesto/i,
  /nadie te dice/i,
];

function isBanned(text) {
  if (text == null) return false;
  const s = String(text);
  return BANNED_PATTERNS.some((re) => re.test(s));
}

// Elige un hook para una intención, evitando los ya usados.
// - Si el intent no tiene hooks, usa todo el banco.
// - Si no queda ninguno fresco, devuelve uno cualquiera con { reused: true }.
// - La rotación de 8 semanas la maneja el caller: guardar hook_id por fecha y
//   pasar como usedHookIds los ids publicados en las últimas 8 semanas.
function pickHook({ intent, usedHookIds = [] } = {}) {
  const pool = (intent && HOOKS.some((h) => h.intents.includes(intent)))
    ? HOOKS.filter((h) => h.intents.includes(intent))
    : HOOKS.slice();
  const used = new Set(usedHookIds);
  const fresh = pool.filter((h) => !used.has(h.id));
  if (fresh.length > 0) {
    return fresh[Math.floor(Math.random() * fresh.length)];
  }
  const fallback = pool[Math.floor(Math.random() * pool.length)];
  return Object.assign({}, fallback, { reused: true });
}

// ---------------------------------------------------------------------------
// COMPATIBILIDAD hook↔tema (2026-10-16) — la falla que no vuelve:
// un caption salió "Esta semana Regalá mamá una presencia digital con Posty
// está más barato en Posty.:" porque el motor metía el tema (una FRASE con
// verbo) dentro de una fórmula de precio sin validar nada. Reglas:
//  - El {tema} de una fórmula es un SUSTANTIVO corto (1-7 palabras), nunca
//    una frase con verbo ni una orden: si arranca con imperativo, no encaja.
//  - El tema no puede contener el nombre del negocio (sale duplicado).
//  - Los hooks de PRECIO exigen precio/promo REAL en la idea: sin precio,
//    "está más barato" es gramaticalmente roto y además un claim falso.
// ---------------------------------------------------------------------------
// NOCHE-48 (2026-10-16): el \b final era ASCII y NO matcheaba los imperativos
// voseo terminados en vocal acentuada (regalá, mirá, probá, vení…): el tema
// exacto del empalme real de v142 ("Regalá mamá…") pasaba hookFits. Se usa
// lookahead de no-letra (incluye acentuadas) en vez de \b.
const IMP_WORDS = 'regalá|regala|vení|veni|pasá|pasa|mirá|mira|probá|proba|descubrí|descubri|aprovechá|aprovecha|sumate|pedí|pedi|hacé|hace|conocé|conoce|animate|fijate|escribinos|reservá|reserva|comprá|compra|llamá|llama|visitá|visita|elegí|elegi|salí|sali|dale|entrá|entra|jugá|juga|soñá|soña|creá|crea|armá|arma|pedile|contanos|mostrá|mostra|buscá|busca|hacete|hacelo|hacela|mira|mire';
const IMPERATIVE_START = new RegExp('^(?:' + IMP_WORDS + ')(?=$|[^a-záéíóúüñ])', 'i');
const PRICE_FORMULA = /más barato|bajamos de precio|bajó|sin margen|te sale menos|descuento|liquidación/i;

function hookFits(hook, { tema, negocio, hasPrice } = {}) {
  const t = String(tema || '').trim();
  if (!hook || !hook.formula) return false;
  if (PRICE_FORMULA.test(hook.formula) && !hasPrice) return false;
  if (hook.formula.includes('{tema}')) {
    if (!t) return false;
    const words = t.split(/\s+/);
    if (words.length > 7) return false;
    if (t.length > 60) return false;
    if (IMPERATIVE_START.test(t)) return false;
    // Tema-TÍTULO (Juli, 2026-10-18 — ids 406 y 110): si el tema ARRANCA
    // con una palabra común capitalizada ("Lo que nuestros usuarios
    // dicen…", "Consejos para optimizar…", "Día a día en la vida de…") es
    // el TÍTULO de otro posteo, no un sustantivo del negocio: no encaja
    // en ninguna fórmula. Un tema sano arranca en minúscula ("la
    // merienda") o es un nombre propio real del negocio.
    if (/^(?:Lo|La|El|Los|Las|Un|Una|Día|Cómo|Consejos)\s/.test(t)) return false;
    if (/[¡!¿?:]/.test(t) || t.includes('—')) return false;
    // Artículo duplicado: si la fórmula ya pone "El {tema}", un tema que
    // arranca con artículo sale "El la línea…" — no encaja.
    const pre = hook.formula.split('{tema}')[0] || '';
    if (/\b(el|la|los|las|El|La|Los|Las)\s+$/.test(pre) && /^(el|la|los|las|un|una)\s/i.test(t)) return false;
    const biz = String(negocio || '').trim().toLowerCase();
    if (biz && t.toLowerCase().includes(biz)) return false;
  }
  return true;
}

// Detector determinista de empalmes en la primera línea: puntuación
// huérfana ("Posty.:"), el negocio repetido, o una apertura desmesurada.
// LINT v2 (Juli, 2026-10-17 — auditoría de producción): la v1 dejaba pasar
// 7 de las 12 aperturas empalmadas vivas en la cuenta 12 (semana 2026-10-12).
// Tres firmas nuevas, todas con caso real y 0 falsos positivos sobre los
// 50 ejemplos del banco:
//  (a) punto seguido de minúscula DENTRO de la apertura — dos frases
//      cosidas en la línea del hook: "El Regalá… de Posty. sin margen…"
//      (id 91). Ninguna fórmula del banco lleva ". " interna.
//  (b) ¿ o ¡ empalmados a mitad de frase — el tema es él mismo una
//      pregunta/exclamación metida en la fórmula: "…haciendo ¿Cómo crear
//      contenido sin estrés? en Posty." (ids 93/109), "…, ¡Novedades…!"
//      (id 113). Un ¿/¡ legítimo abre la línea (índice 0), no la parte.
//  (c) artículo + palabra capitalizada al abrir — el tema-título/frase se
//      cosió tras el artículo de la fórmula: "El De escéptica a fan:…"
//      (id 112), "El Regalá una presencia…" (id 91). Con tema sano el
//      segundo token va en minúscula ("El pan de campo…").
function captionOpenIsGarbled(caption, negocio) {
  const first = String(caption || '').split('\n')[0].trim();
  if (!first) return false;
  if (/[.,:;]{2,}/.test(first.replace(/\.\.\./g, ''))) return true;
  if (/\w\.:(?!\/)/.test(first)) return true;
  if (/\.\s+[a-záéíóúñ]/.test(first)) return true;
  if (/[¿¡]/.test(first.slice(1))) return true;
  // EXENCIÓN DEL NOMBRE (2026-10-19): las dos firmas de abajo miran
  // artículos y mayúsculas, y un nombre de negocio puede contenerlas
  // legítimas ("Lo de Marta", "La Cocina de Ana") sin que haya empalme.
  // Se evalúan sobre `masked`: el caption con el nombre del negocio
  // reemplazado por un token neutro. El resto de las reglas
  // (puntuación, duplicación del nombre, largo) no dependen de esto y
  // corren sobre el texto real.
  const bizRaw = String(negocio || '').trim();
  let masked = first;
  if (bizRaw.length >= 3) {
    // LINT v4 (Parte 62, mediodía 2026-10-19): la máscara cubre el nombre
    // y sus FORMAS CORTAS — la cabeza antes del primer/último «de» y las
    // dos primeras palabras si el nombre abre con artículo («La Cocina»
    // por «La Cocina de Ana», «La Casa de Té» por «La Casa de Té de
    // Ana»): nombrar corto es como los negocios se nombran, y la v3 lo
    // marcaba como empalme. El token va en minúscula: capitalizado, un
    // artículo ajeno («El Café Aroma…» → «El Negocio…») gatillaba solo
    // la firma (c).
    const variants = new Set([bizRaw]);
    if (/^(?:el|la|los|las|lo)\s/i.test(bizRaw)) {
      const toks = bizRaw.split(/\s+/);
      const lowToks = toks.map((t) => t.toLowerCase());
      const deFirst = lowToks.indexOf('de');
      const deLast = lowToks.lastIndexOf('de');
      if (deFirst >= 2) variants.add(toks.slice(0, deFirst).join(' '));
      if (deLast >= 2 && deLast !== deFirst) variants.add(toks.slice(0, deLast).join(' '));
      if (toks.length >= 3) variants.add(toks.slice(0, 2).join(' '));
    }
    const sorted = [...variants].filter((v) => v.length >= 4).sort((a, b) => b.length - a.length);
    for (const v of sorted) {
      const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replace(new RegExp(esc, 'gi'), 'negocio');
    }
  }
  if (/^(?:El|La|Los|Las|el|la|los|las)\s+[A-ZÁÉÍÓÚÑ]/.test(masked)) return true;
  // (d) LINT v3 (Juli, 2026-10-18) — la firma residual pre-registrada el
  // 17/10 apareció en generación NUEVA: id 406, "Lo que nos dijo una
  // clienta después de probar Lo que nuestros usuarios dicen de Posty en
  // Posty" — un tema-TÍTULO cosido a mitad de frase. Su delator: una
  // palabra común (Lo/La/El/Los/Las/Un/Una) con mayúscula tras una
  // palabra en minúscula y seguida de minúscula (evaluado sobre el
  // texto con el nombre del negocio enmascarado — ver exención arriba).
  // Si lo que sigue también va en mayúscula es nombre propio ("nuestro
  // local de La Plata abre…") y no se marca. Ídem el modismo "Día a día"
  // capitalizado (id 111); "Día de la Madre" no matchea (nombre propio).
  if (/[a-záéíóúñü]\s+(?:Lo|La|El|Los|Las|Un|Una)\s+[a-záéíóúñü]/.test(masked)) return true;
  if (/[a-záéíóúñü]\s+Día a día/.test(masked)) return true;
  // (d') LINT v4 (Parte 62): el tema-título también se cose tras
  // puntuación débil (coma, punto y coma, dos puntos — el separador le
  // robaba a la v3 el «carácter en minúscula» que exigía antes del
  // título) y con titulares que la lista de la v3 no traía: «Cómo…» y
  // «Consejos…» son arranque de título, nunca palabra común capitalizada
  // a mitad de frase en español sano.
  if (/[a-záéíóúñü,:;—–-]\s+(?:Lo|La|El|Los|Las|Un|Una|Cómo|Consejos)\s+[a-záéíóúñü]/.test(masked)) return true;
  // (d'') El fragmento «De…» (la firma del 112 sin su «El» inicial):
  // «De» capitalizada tras palabra común o puntuación, seguida de
  // minúscula que NO sea artículo — los nombres de persona («María De
  // los Ángeles», «Juan De Dios») quedan fuera por esa guarda.
  if (/[a-záéíóúñü,:;—–-]\s+De\s+(?!el\s|la\s|los\s|las\s|un\s|una\s)[a-záéíóúñü]/.test(masked)) return true;
  // (f) LINT v4: el espejo de la firma (b) para los signos de CIERRE —
  // un «?» o «!» seguido de minúscula es una pregunta o exclamación
  // incrustada sin su signo de apertura (los ids 93/109 escritos sin
  // «¿») SOLO si el segmento no abre con «¿»/«¡»: la pregunta que abre
  // la línea y sigue en minúscula («¿te duele la uña? turno esta
  // semana…») es el estilo del dueño, no una costura — la firma es el
  // fragmento incrustado en un segmento que no lo abrió.
  for (const mk of masked.matchAll(/[?!]\s+[a-záéíóúñü]/g)) {
    const pre = masked.slice(0, mk.index);
    const segStart = Math.max(pre.lastIndexOf('. '), pre.lastIndexOf('? '), pre.lastIndexOf('! '), pre.lastIndexOf(': '), pre.lastIndexOf('; '), pre.lastIndexOf(' — '));
    const seg = (segStart >= 0 ? pre.slice(segStart + 2) : pre).trim();
    if (seg.startsWith('¿') || seg.startsWith('¡')) continue;
    return true;
  }
  // (g) LINT v5 (Juli, 2026-10-24) — el empalme de la fórmula h11 SIN
  // puntuación ni título: id 448 real de producción (cuenta 81, generado
  // HOY sobre v383): «Lo que nos dijo una clienta después de probar
  // Unite a nuestra comunidad de negocios en Posty» — el tema cosido en
  // el slot de h11 («después de probar {tema}») es una FRASE IMPERATIVA
  // completa, no un sustantivo. Las firmas (d)/(d') no lo cazan (no hay
  // palabra común capitalizada de su lista: «Unite» es verbo) y la (e)
  // exige puntuación débil antes del imperativo: acá la costura es un
  // espacio. Firma angosta: tras «después de probar/probarlo/probarla/
  // probando» (+ hasta 3 palabras), un imperativo del banco CON
  // MAYÚSCULA inicial es el arranque del tema-frase cosido. El tema
  // legítimo es sustantivo («las medialunas», «nuestro café») o el
  // negocio (ya enmascarado a «negocio»): ninguno es imperativo
  // capitalizado. Lista local por la regla de autocontención de (e).
  {
    const IMP_G = 'unite|sumate|reservá|reserva|descubrí|descubri|conocé|conoce|probá|proba|mirá|mira|vení|veni|hacé|hace|pedí|pedi|escribí|escribi|escribinos|aprovechá|aprovecha|animate|fijate|regalá|regala|pasá|pasa|entrá|entra|comprá|compra|llamá|llama|elegí|elegi|armá|arma|mostrá|mostra|buscá|busca|contanos|dale';
    const mg = masked.match(new RegExp('\\b[Dd]espu[eé]s de prob(?:ar|arlo|arla|arlos|arlas|ando)\\b((?:\\s+\\S+){0,3}?)\\s+([A-ZÁÉÍÓÚÑ][a-záéíóúüñ]*)'));
    if (mg && new RegExp('^(?:' + IMP_G + ')$', 'i').test(mg[2])) return true;
  }
  // (h) LINT v6 (Juli, 2026-10-25) — fórmula + imperativo tras preposición:
  // id 454 real (cuenta 80, semana 2026-10-19, generado 24/10): «El error
  // que casi todos cometen con Organizá tu agenda como un pro (…)» — la
  // fórmula cose como tema una FRASE IMPERATIVA tras la preposición.
  // Las firmas (d)/(d') no la cazan («Organizá» no está en su lista) y
  // la (e) exige puntuación débil antes del imperativo: acá la costura
  // es un espacio tras «con». Firma angosta: tras «con / de / por /
  // para / sobre», un imperativo del banco CON MAYÚSCULA inicial. Un
  // tema sano tras preposición va en minúscula («con el café», «de la
  // casa») o es el negocio (ya enmascarado a «negocio»): ningún
  // sustantivo sano arranca con imperativo capitalizado. Se evalúa
  // sobre `masked` para que un negocio llamado como un verbo no dispare.
  // «dale» queda fuera del banco: como nombre propio tras «para» es más
  // probable que como imperativo cosido.
  {
    const IMP_H = 'unite|sumate|reservá|reserva|descubrí|descubri|conocé|conoce|probá|proba|mirá|mira|vení|veni|hacé|hace|pedí|pedi|escribí|escribi|escribinos|aprovechá|aprovecha|animate|fijate|regalá|regala|pasá|pasa|entrá|entra|comprá|compra|llamá|llama|elegí|elegi|armá|arma|mostrá|mostra|buscá|busca|contanos|organizá|organiza|formá';
    for (const mm of masked.matchAll(/\b(?:con|de|por|para|sobre)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúüñ]*)/g)) {
      if (new RegExp('^(?:' + IMP_H + ')$', 'i').test(mm[1])) return true;
    }
  }
  const biz = String(negocio || '').trim().toLowerCase();
  // (e) LINT v4: la FÓRMULA cosida tras el tema. Las costuras de
  // producción (v142 y familia) no siempre traen la firma del título: a
  // veces un tema-declarativo queda pegado a la fórmula imperativa del
  // banco («<tema>, Regalá … con <negocio>») con una coma, un punto y
  // coma, una raya o un emoji de por medio. La firma general: un
  // imperativo del banco pegado tras esa puntuación débil, con al
  // menos 3 palabras de tema antes, en una línea que no abre con
  // imperativo (la cadena de imperativos del dueño — «Vení, probá…» —
  // abre con uno) y cuyo fragmento nombra al negocio (las fórmulas
  // del banco se renderizan con el negocio adentro). Un CTA suelto
  // tras una declaración («…, probá el blend») no nombra al negocio:
  // no se marca.
  // NOTA: esta función tiene que quedar AUTOCONTENIDA (sin referencias a
  // constantes del módulo): el harness de entrenamiento la evalúa desde
  // su fuente para inyectarla en el stub de captionPasses. Por eso la
  // lista de imperativos se repite acá en vez de usar IMP_WORDS.
  const IMP_LOCAL = 'regalá|regala|vení|veni|pasá|pasa|mirá|mira|probá|proba|descubrí|descubri|aprovechá|aprovecha|sumate|pedí|pedi|hacé|hace|conocé|conoce|animate|fijate|escribinos|reservá|reserva|comprá|compra|llamá|llama|visitá|visita|elegí|elegi|salí|sali|dale|entrá|entra|jugá|juga|soñá|soña|creá|crea|armá|arma|pedile|contanos|mostrá|mostra|buscá|busca|hacete|hacelo|hacela|mira|mire';
  const startsImp = new RegExp('^(?:' + IMP_LOCAL + ')(?=$|[^a-záéíóúüñ])', 'i');
  if (biz && biz.length >= 3 && !startsImp.test(first)) {
    const impRe = new RegExp('(?:^|[^a-záéíóúüñ])(' + IMP_LOCAL + ')(?=$|[^a-záéíóúüñ])', 'gi');
    let im;
    while ((im = impRe.exec(first)) !== null) {
      // Solo COSTURA: el imperativo tiene que venir pegado tras una
      // puntuación débil (coma, punto y coma, dos puntos, raya) o un
      // emoji separador. Tras un punto es una oración nueva legítima
      // (el CTA de siempre: «…en todo. Escribinos por DM y reservá…»)
      // y tras «y» es la cadena de acciones del mismo CTA: ninguno de
      // los dos es un fragmento cosido.
      const beforeText = first.slice(0, im.index);
      if (!/[,;:—–-]\s*$/.test(beforeText) && !/\p{Extended_Pictographic}\s*$/u.test(beforeText)) continue;
      const wordsBefore = beforeText.split(/\s+/).filter(Boolean).length;
      if (wordsBefore < 3) continue;
      const frag = first.slice(im.index).trim();
      if (frag.toLowerCase().includes(biz)) return true;
    }
  }
  if (biz && biz.length >= 3) {
    const hits = first.toLowerCase().split(biz).length - 1;
    if (hits >= 2) return true;
  }
  if (first.split(/\s+/).length > 26) return true;
  return false;
}

// Renderiza la fórmula reemplazando {tema} y {negocio}.
// Slots faltantes -> '' limpio: sin llaves colgadas, sin dobles espacios.
function renderHook(hook, { tema, negocio } = {}) {
  let out = String(hook && hook.formula ? hook.formula : '');
  out = out.split('{tema}').join(tema != null ? String(tema).trim() : '');
  out = out.split('{negocio}').join(negocio != null ? String(negocio).trim() : '');
  out = out.replace(/\s+/g, ' ').trim();
  // Limpia puntuación huérfana que quedó del slot vacío (ej: "de  en" ya
  // resuelto por el colapso de espacios; acá solo restos tipo "( )" o '""').
  out = out.replace(/\(\s*\)/g, '').replace(/"\s*"/g, '""').replace(/\s+/g, ' ').trim();
  return out;
}

// Garantiza que el caption abra con el hook. Si ya abre con él (trim,
// case-insensitive) lo deja intacto; si no, lo antepone con '\n\n'. Nunca duplica.
function ensureCaptionOpensWithHook(caption, hookText) {
  const cap = caption == null ? '' : String(caption);
  const hook = hookText == null ? '' : String(hookText).trim();
  if (!hook) return cap;
  const firstLine = cap.split('\n')[0].trim().toLowerCase();
  if (firstLine === hook.toLowerCase() || firstLine.startsWith(hook.toLowerCase())) {
    return cap;
  }
  return hook + '\n\n' + cap;
}

// Mapa intención -> ids, para debug.
function hookIntentMap() {
  const map = {};
  for (const intent of INTENTS) map[intent] = [];
  for (const h of HOOKS) {
    for (const intent of h.intents) {
      if (!map[intent]) map[intent] = [];
      map[intent].push(h.id);
    }
  }
  return map;
}

module.exports = {
  INTENTS,
  HOOKS,
  BANNED_PATTERNS,
  isBanned,
  pickHook,
  renderHook,
  ensureCaptionOpensWithHook,
  hookFits,
  captionOpenIsGarbled,
  hookIntentMap,
};
