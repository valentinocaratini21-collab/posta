// caption-style.js — Caption Style Lock: tono de escritura del cliente desde su IG real.
//
// analyzeCaptionStyle(db, userId): baja los últimos captions del IG conectado,
// los analiza con gpt-4o (texto) y guarda un perfil JSON en ig_caption_style.
// getCaptionStyle(db, userId): lee el perfil guardado (null si no existe).
// captionStyleBlock(profile): bloque "ESCRIBÍ COMO EL CLIENTE: ..." para el prompt.
// CAPTION_CHECKLIST: checklist anti-genérico (se inyecta SIEMPRE, con o sin perfil).
// captionPromptExtras(db, userId): checklist + bloque de estilo (si hay perfil).
// isArgentineClient(db, userId): true si el timezone del cliente es argentino.
//
// Contrato: NUNCA lanza. analyzeCaptionStyle devuelve {ok:true, profile, analyzed_at}
// o {ok:false, error}. getCaptionStyle devuelve profile|null. captionStyleBlock y
// captionPromptExtras devuelven string ('' ante cualquier falla).

const { getCreds } = require('./insights');

let costs = null;
try { costs = require('./costs'); } catch (_) { costs = null; }

const CAPTION_MODEL = 'gpt-4o-mini'; // costo (2026-10-02): analiza TEXTO, no necesita visión
const MIN_CAPTIONS = 6;   // mínimo de captions con texto para perfilar
const MAX_CAPTIONS = 9;   // tope que se analiza

const ANALYZE_SYSTEM = [
  'Sos un editor de contenidos. Te paso hasta 9 captions reales de Instagram de un negocio.',
  'Analizá CÓMO escriben (no qué venden) y devolvé SOLO JSON con estas claves:',
  '- tone: cómo suena (ej: "informal rioplatense", "formal y sobrio", "canchero con humor")',
  '- emoji_style: "frecuente" (3+ por caption), "moderado" (1-2), "escaso" (alguno suelto) o "nada"',
  '- avg_length: largo típico en palabras (entero)',
  '- cta_style: cómo cierran (ej: "invita a escribir por DM", "pide comentar una palabra", "sin CTA")',
  '- hashtag_style: cómo usan hashtags (ej: "3-5 de nicho al final", "10+ mezclados", "no usa")',
  '- opening_style: cómo abren (ej: "pregunta directa", "afirmación corta", "emoji + frase")',
  '- persona: "1ra persona" (yo/nosotros), "2da persona" (vos/tú) o "mixto"',
  'Todo en español rioplatense, conciso. Si no hay patrón claro en un campo, poné "variado".',
].join('\n');

function getOpenAiKey(db, userId) {
  try {
    const s = db.prepare('SELECT openai_key FROM settings WHERE user_id = ?').get(userId) || {};
    return s.openai_key || process.env.OPENAI_API_KEY || '';
  } catch (_) {
    return process.env.OPENAI_API_KEY || '';
  }
}

// Checklist anti-genérico: se inyecta en TODOS los prompts de caption, siempre.
const CAPTION_CHECKLIST = [
  'CHECKLIST ANTI-GENÉRICO (obligatorio en CADA caption que escribas, sin excepciones):',
  '1. UNA idea por posteo. Específico > genérico: nombrá productos/servicios reales del negocio (los de su ficha y ADN). Nunca "nuestros productos", "lo mejor", "la mejor calidad" sin decir QUÉ.',
  '2. CTA concreto SIEMPRE: una acción real y posible ("escribinos por WhatsApp", "reservá tu turno", "pasá por el local"). Nunca CTA vacío ("¡no te lo pierdas!", "aprovechá", "contactanos") y nunca "te esperamos" a secas: si invitás, decí CUÁNDO y CÓMO.',
  '3. Hashtags: MÁXIMO 5, todos relevantes al rubro y al posteo (esto reemplaza cualquier otro límite de este prompt). Prohibido relleno: #love #instagood #photooftheday y genéricos quemados. Y ROTÁ: nunca el mismo bloque de hashtags en dos posteos seguidos del mismo cliente.',
  '4. Nunca cierres con la misma fórmula dos veces seguidas: variá el CTA final (pedido por DM, pregunta, invitación al local) para que no parezca template.',
  '5. Prohibido abrir con muletillas: nunca arranques con "¡Hola!", "¡Descubrí…" o "¿Sabías que…?" como fórmula automática.',
  '6. El caption tiene que MATCHEAR lo que muestra la imagen: no prometas, describas ni vendas lo que no se ve en la foto/video.',
  '7. Si el negocio es argentino: escribí en rioplatense con voseo ("vos"), siempre.',
  '8. Prohibido el GRITO: nunca uses MAYÚSCULAS para énfasis en el cuerpo del caption ("SUS fotos", "YA ESTÁ ARMADA"); si algo merece énfasis, que lo diga la frase, no el formato. Prohibido asteriscos para énfasis (*así*): en Instagram se ven literales y delatan que lo escribió una IA.',
  '9. Rotá tus propios recursos entre posteos consecutivos del mismo cliente: el emoji no va siempre en el mismo lugar (a veces en el cuerpo, a veces ninguno); el cierre del mecanismo no termina siempre con las mismas palabras (alterná "sin tarjeta" con "sin compromiso", "sin atarte a nada", o cerrá distinto); y nunca repitas la misma idea-concepto dos posteos seguidos (si el anterior cerró con "solo tenés que aprobar", este posteo aprueba implícito y cierra con otra idea). Tampoco repitas el INVENTARIO POSESIVO ("sus X, sus colores" / "sus fotos, sus colores") en posteos seguidos: nombrá UNA sola cosa concreta del negocio o describí la escena sin listar posesivos. Y no repitas el ESQUELETO COMPLETO del párrafo del mecanismo (invitación + "contanos" + "subí tus fotos" + "en minutos tenés 5 posteos" + "retocar por chat"): si el posteo anterior ya explicó cómo funciona, este lo da por sabido o lo cuenta con otra estructura. Pero rotá la FORMA, no el SENTIDO: al variar, no cambies el verbo de la acción por un sinónimo impreciso (los posteos son para mirar/aprobar, nunca "para opinar"; el cliente aprueba, no "da feedback") ni encadenes 3 imperativos seguidos (suena a tutorial, no a persona); y nunca abras un párrafo con un descargo ("va un ejemplo inventado", "para que se entienda"): la muestra se integra a la frase o va al final. Si el sinónimo suena raro, volvé a la palabra simple. Y la rotación se mide sobre las FRASES EXACTAS y la IDEA, no solo sobre el tipo o la posición del recurso: prohibido repetir anclas léxicas ("en esta muestra", "listos para mirar", "¿y el tuyo / la tuya / en tu local?") en posteos seguidos, y prohibido cerrar el mecanismo con la misma idea aunque cambien las palabras (el retoque por chat no cierra dos posteos seguidos: alterná con la fecha, el resultado o el próximo paso). Cambiar de lugar una frase repetida no es rotarla. Los humanos no repiten sus propios recursos; la repetición es la firma más visible de la IA.',
  '10. La primera línea jamás cose un TÍTULO ajeno: el tema de la apertura es un sustantivo corto y concreto del negocio ("la merienda", "el tratamiento capilar"), nunca el título de otro posteo ni una frase con verbo ("Lo que nuestros usuarios dicen…", "Consejos para optimizar…", "Día a día en la vida de…"). Si tu apertura nombra dos veces al negocio o lleva una palabra común con mayúscula en mitad de la frase ("…después de probar Lo que…"), está empalmada: reescribila con un tema-sustantivo antes de entregar.',
  '11. El CUERPO también pasa por la puerta (M79): la prohibición de muletillas del ítem 5 vale para TODAS las oraciones, no solo la primera ("¿Sabías que…?" no abre ninguna oración del caption); nada de superlativos vacíos sin dato ("se merece lo mejor" sin decir qué, cuánto o cuándo) ni frases quemadas ("hace la diferencia" sin contar en qué); y dentro de la MISMA semana ningún posteo abre con el mismo dispositivo que otro: "¿Cuántas veces te pasó…?" vale una sola vez por semana, no en cuatro posteos — variá la fórmula de arranque entre posteos de la misma tanda (escena, dato, afirmación, pregunta distinta).',
  '12. VOSEO SIN EXCEPCIÓN y dispositivo en cualquier posición (CUERPO-57): el voseo es de TODA la pieza — "te imaginas / te quieres / te tienes / te puedes" es tuteo y la puerta (captionPasses) lo rechaza siempre: escribí "te imaginás, querés, tenés, podés". Y el dispositivo de apertura de la semana ("¿cuántas veces te…?", "¿te preguntaste…?", "¿te imaginás…?") vale una sola vez por semana EN CUALQUIER oración del caption, no solo en la primera línea: no lo escondas como segunda oración.',
  '13. Nunca "potenciar" en ninguna de sus formas (CUERPO-CORP): ni "potenciar tu posteo", ni "potenciá tu cuenta", ni "potencia tus ventas" — es lenguaje corporativo de folleto, ningún dueño habla así de su negocio, y la puerta (captionPasses) lo rechaza siempre. Si querés decir que algo va a andar mejor, decí QUÉ pasa en concreto: qué posteo se empuja, con qué pauta, para qué fecha.',
  '14. Nada de BINOMIOS VACÍOS (CUERPO-BINOMIO): nunca pares de sustantivos abstractos de folleto unidos por "y" — "elegancia y funcionalidad", "calidad y diseño", "estilo y confort" — la puerta (captionPasses) los rechaza siempre. Un dueño no describe su producto con dos abstracciones: dice lo concreto que lo hace bueno (el material, la medida, el uso, cuánto dura). Los pares concretos sí valen ("mesas y sillas", "corte y barba").',
  '15. LISTAS COMPLETAS O NINGUNA (LISTA-TRUNCADA): si anunciás una enumeración ("los 3 errores…", "seguí estas ideas"), escribí TODOS los ítems con su texto en la misma línea — jamás un ítem vacío ("…: 1." y saltar al CTA, o cerrar el caption con un "3." pelado): la puerta (captionPasses) lo rechaza siempre. Si no entra, no enumeres: contá la idea principal en una frase. Y el tema que sigue a "después de probar…" es siempre un sustantivo concreto del negocio, nunca una frase con verbo ni un imperativo ("después de probar Unite a…" es un empalme: el lint lo frena).',
  '16. TRAS UNA PREPOSICIÓN DE FÓRMULA NUNCA VA UN IMPERATIVO (LINT v6): si tu apertura es una fórmula ("El error que casi todos cometen con…", "El ingrediente de…", "Vino por…"), lo que sigue a "con / de / por / para / sobre" es un sustantivo en minúscula del negocio ("con el café", "de la casa"), nunca una orden capitalizada ("con Organizá tu agenda…", "por Formá parte de…"): eso es un empalme — dos frases cosidas — y el lint lo frena. Si el tema que querés poner es una frase con verbo, reescribí la apertura entera como una sola frase tuya, sin fórmula.',
  '17. NADA DE FRAGMENTOS FRONTADOS (TIC "A LA MAÑANA FUERTE"): nunca abras con un adverbio de tiempo + adjetivo colgado ("A la mañana fuerte, servimos…", "A la tarde lindo, tenemos…"): ningún humano ordena así la frase — es la firma del generador frontando un pedazo del tema. Decí la frase en orden natural ("Para arrancar fuerte la mañana, servimos…", "A la mañana, el café sale…"). La puerta (captionPasses) rechaza "a la mañana fuerte" siempre, en cualquier variante de mayúsculas.',
  '18. SI ANUNCIÁS UN NÚMERO, ENTREGÁ ESE NÚMERO (LISTA-ANUNCIADA-INCOMPLETA): si decís "3 tips", "los 3 errores" o "5 pasos", el caption trae EXACTAMENTE esa cantidad de ítems numerados — jamás uno solo con el anuncio de tres (el id 520 real anunció 3 tips y entregó un único "1️⃣"). Si no entran todos, no anuncies el número: contá la idea en prosa ("primero…, después…") o escribí la lista completa. La puerta (captionPasses) rechaza la lista anunciada incompleta siempre.',
  '19. NADA DE PENINSULAR (PENINSULAR): en rioplatense el imperativo es "elegí", no "elige" ("Elige entre nuestras opciones…", id 505 real, es de España), y el deíctico es "acá", no "aquí" ("Aquí te paso…", id 520 real). La puerta (captionPasses) rechaza "elige" abriendo oración y "aquí te/les/va/van" siempre — pero ojo: la pasiva legítima ("se elige el grano") y la tercera persona con sujeto ("el cliente elige") NO se tocan, y "acá" solo no es defecto. Ni un emoji entre el signo y la palabra lo esconde: "¿…? 🎂 Elige entre…" también es peninsular (variante del 505, 2026-11-01).',
  '20. TRAS "DESPUÉS DE PROBAR" VA EL PRODUCTO, NO EL RÓTULO (LINT v7): si la apertura es "Lo que nos dijo una clienta después de probar…", lo que sigue es un sustantivo concreto del negocio ("el tratamiento capilar", "las medialunas"), nunca el rótulo genérico de otro posteo capitalizado con su frase ("después de probar Testimonio de nuestros usuarios…", id 458 real, es un empalme: dos textos cosidos). El lint lo frena solo cuando el rótulo trae frase detrás (al menos 2 palabras más): un nombre propio corto ("Café Aroma") o un tema en minúscula pasan limpios.',
  '21. NADA DE PROMESAS VACÍAS (FLUFF): nunca "hacerte la vida más fácil" (id 516 real: "En Gesty, estamos para hacerte la vida más fácil" no dice qué hace Gesty) ni "sin complicaciones" (ids 408/450 reales: "contenido sin complicaciones" es relleno de plantilla, no una ventaja). Si querés decir que algo es fácil, decí EL HECHO: qué queda hecho, para cuándo, sin qué esfuerzo del cliente ("dejamos presupuestos, facturación y cobranzas al día"). La puerta (captionPasses) rechaza ambas frases siempre.',
  '22. EL PUNTO NO ES PARTE DEL NOMBRE (LINT v8): si la ficha guarda el nombre con punto final ("Posty."), el nombre es "Posty": nunca escribas el punto como si fuera del nombre en mitad de frase, y nunca uses ese punto para esconder que nombraste al negocio dos veces en la misma apertura (id 518 real: "…en Posty que… en Posty." pasó el lint porque la ficha con punto cegaba la regla de duplicado — el lint ya normaliza el nombre antes de contar, pero vos nombralo UNA sola vez por apertura). El punto solo cierra una frase, nunca acompaña al nombre dentro de ella.',
  '23. CAMBIAR EL GÉNERO NO CAMBIA EL CLICHÉ (FRASE QUEMADA "LA"): "No te la podés perder" es exactamente el mismo CTA vacío que "No te lo podés perder" (id 529 real, cuenta 84: "No te la podés perder, ¡es nuestra última creación!" — la torta del día no necesita el cliché, necesita el dato: qué torta es, cuándo sale, hasta cuándo queda). La puerta (captionPasses) rechaza ambas formas siempre. Si querés urgencia, poné el hecho concreto (se acaba hoy, quedan pocas, sale del horno a tal hora), nunca el "no te la/lo podés perder" con otro género.',
  '24. NADA DE CONFESIÓN PREFABRICADA: nunca "Te voy a ser honesto:" como preámbulo (11 captions reales en 3 cuentas, 2026-10-24/25: 84: 531/502/495/475/468, 80: 512/511/458/456, 81: 449 — siempre abriendo la segunda oración, siempre el mismo dispositivo: cuando una muletilla cruza cuentas, no es voz del cliente, es plantilla). La confesión no dice nada: andá directo al dato ("el secreto está en los presupuestos bien armados", "cada taza sale de…") sin anunciar que vas a ser honesto. La puerta (captionPasses) rechaza "te voy a ser honesto/honesta" siempre. OJO HISTÓRICO, CERRADO 2026-11-04: la semilla estaba en el propio prompt (CAPTION_CRAFT enseñaba "Confesión o detrás de escena: Te voy a ser honesto..." como técnica de hook) — el 2026-11-04 se retiró del prompt y se reemplazó por "Detrás de escena: el dato directo, sin anunciar honestidad", y la entrada v579 de la puerta se restauró el mismo día (el árbol v624 la había perdido: la sección (r) del test fallaba 3/3 en HEAD). La puerta queda como respaldo, no como único freno.',
  '25. PENINSULAR TAMBIÉN ES "DEJA" (PENINSULAR-DEJA): el imperativo peninsular no es solo "elige": "Deja de preocuparte y dejame hacerlo por vos" (id 554 real, cuenta 12, 2026-11-05) es de España igual que "Elige entre…". En rioplatense es "Dejá de preocuparte". La puerta (captionPasses) rechaza "deja" abriendo oración igual que "elige" — pero ojo: la tercera persona NO se toca ("me deja tranquilo", "eso deja mucho que desear" pasan limpios, porque ahí "deja" no es una orden). Si el verbo es una orden y va dirigido al lector, va en voseo: dejá, elegí, mirá, pasá.',
  '26. EL FUNDAMENTO NO SE PUBLICA (LEAK-FUNDAMENTO): el brief interno del negocio ("Producto literal", "Objetivo del posteo", "Voz:", "Precios en posteos:", "Dónde lo encuentran") es materia prima para escribir, NUNCA texto del caption (id 555 real, cuenta 85, 2026-11-06: "…Pasá por el local y probalo hoy / Tal como pediste: Producto literal (escrito por el dueño): Café de especialidad Objetivo del posteo: compras Voz: cercano Precios en posteos: sí Dónde lo encu…" — el bloque pegado crudo y cortado a mitad de palabra por el tope de largo). Si tu borrador trae un rótulo del brief, borralo entero y escribí la frase con tus palabras: el cliente lee el posteo, no el brief. La puerta (captionPasses) rechaza "producto literal" y "objetivo del posteo" siempre. Tampoco son texto del caption las líneas de eco del motor: "En tus palabras: «X»" / "Tal como pediste: ..." (y en inglés "In your words:" / "As you asked:") — son notas internas que cierran el borrador y NUNCA se publican (14 captions reales 11-12/11 las llevaron pegadas, con marcadores basura como "locations" o "constancetenvik"): si tu borrador trae una, borrala entera; la voz del cliente va en el cuerpo, no como rótulo al final. La puerta rechaza esas líneas siempre.',
  '27. LA MARCA EN MAYÚSCULAS NO ES GRITO, Y LA FÓRMULA NO SE PEGA AL TEMA (GRITO-MARCA / EMPALME-EN): si el nombre del negocio se escribe en mayúsculas (VEJA, BYREDO), nombrarlo así está bien — la puerta lo enmascara antes del chequeo de grito en los dos idiomas (en español entró el 2026-11-13: antes rechazaba cualquier caption que nombrara a esas marcas). Lo que sigue siendo grito es el énfasis en mayúsculas sobre palabras que no son la marca. Y en inglés, la fórmula del tip nunca se cose a un tema con artículo: "choosing your the salar well" (id 656 real, VEJA, 2026-11-13) es un empalme — el tema entra limpio ("Salar") o la apertura se reescribe entera; la puerta EN lo rechaza como apertura empalmada.',
  '28. LOS HASHTAGS SON DEL RUBRO DE ESTE NEGOCIO (HASHTAGS-RUBRO): el campo hashtags se lee como parte del posteo y se indexa como tal — un set de otro rubro es un defecto del posteo entero, no un detalle (id 700 real, Bill Lawrence Salon, peluquería de Washington DC con caption de cortes y color, publicó el 2026-11-18 con #beautyroutine #selfcare #skincare #glowingskin: el set de skincare en una peluquería; id 701 real, All Life is Yoga, publicó el mismo día con #training #personaltrainer #gymlife #fitness: el set de gimnasio en un estudio de yoga). Antes de cerrar el posteo, mirá el set contra el negocio y contra ESTE caption: si dos o más tags son de la familia de otro rubro (skincare sin que nada hable de la piel; gym en un negocio de yoga/pilates), el set está mal — escribí los del rubro real (la peluquería: corte, color, pelo; el yoga: yoga, la práctica, el barrio). La puerta hashtagsPass lo rechaza siempre que el llamador pasa el campo, y el lint al programar lo corre sobre todo posteo. Ojo: el contexto manda — una estética que habla de la piel usa #skincare bien, y un gimnasio usa #gymlife bien; lo prohibido es el set cruzado, no la palabra.',
  '29. EL PRECIO VA COMPLETO O NO VA (PRECIO-HUÉRFANO): si un caption trae un precio, el lector tiene que poder leer cuánto sale: signo y número entero ("$4.77", "$6.700"). Un decimal suelto (".77", "0.77" sin signo) es un precio mutilado — la transcripción perdió el signo y la parte entera y el posteo no dice cuánto sale nada (id 712 real, Big Top Candy Shop, programado 2026-11-19: "hand-jerked sodas .77, sundaes .77, the banana split 0.77"; se publicó reescrito sin precios porque los reales no estaban en la ficha). Si el precio real no está en el fundamento, el caption va SIN precio — nunca con el fragmento. La puerta (captionPasses/captionPassesEn) lo rechaza en los dos idiomas.',
  '30. LA VOZ EN MINÚSCULA CON NOMBRE PROPIO NO ES EMPALME (LINT v12): si tu voz es toda en minúscula (la de la línea a mano: oraciones cortas separadas por puntos), nombrar un producto con su mayúscula en mitad de oración («vuelven por la Volt, la chunky de siempre», id 740 real, cuenta 12, 2026-11-20) NO cose nada: la mayúscula que delata una costura es la que ABRE una oración mezclada con otra que arranca en minúscula tras un punto. El lint (captionOpenIsGarbled, regla b\'\') ya distingue las dos cosas desde la v12 — escribí en tu voz sin miedo a nombrar el producto, y no «arregles» una apertura sana capitalizándola.',
  '31. EL DISPOSITIVO REPETIDO SE VE AUNQUE NO HAYA CTA (PARIDAD-CLASH): el formato póster no trae CTA por diseño, pero eso no esconde una apertura repetida: si tu caption abre con el mismo dispositivo que otro posteo de la misma semana (la misma familia de pregunta o las mismas tres primeras palabras), la puerta lo rechaza POR EL DISPOSITIVO, antes de mirar el CTA — en los dos idiomas y también en el re-chequeo de último momento antes de programar (captionWeekClash elige la puerta por el idioma del caption desde el 2026-11-21; antes corría siempre la puerta en español y un titular repetido en inglés, como el del id 739 contra el 735, pasaba como nota de CTA). Un solo uso del dispositivo por semana, con CTA o sin CTA.',
  '32. APERTURA LARGA NO ES EMPALME (LINT v13): si la primera oración pasa las 26 palabras, el problema es el LARGO, no una costura: la oración puede estar perfecta y aun así leerse de un tirón (id 741 real, 2026-11-21: la fórmula de la serie con el nombre largo del producto la empujó a 27). Acortá sacando UN detalle (el negocio ya está en la imagen) o partiendo en dos oraciones — nunca reescribas buscando un empalme que no existe. La puerta lo frena con su propio motivo («apertura larga») desde el 2026-11-22; antes lo reportaba como empalme y el reintento descocía aire.',
].join('\n');

// (CORRECTIVO-3 · IDIOMA FAIL-CLOSED) Espejo en inglés estadounidense de
// CAPTION_CHECKLIST: las mismas reglas anti-genérico SIN el reglamento en
// español (nada de la orden de escribir en rioplatense ni de sus ejemplos):
// para marcas cuyo contenido es en inglés (lang 'en'), inyectar el
// reglamento ES le ordenaba al modelo escribir en español DENTRO de un
// prompt en inglés (costura diagnosticada en Hungry Ghost/Veja: el cuerpo
// salía en español con la puerta EN reprobándolo). Lo usa
// captionPromptExtras(db, uid, 'en'); sin lang o con 'es', el histórico.
const CAPTION_CHECKLIST_EN = [
  'ANTI-GENERIC CHECKLIST (mandatory in EVERY caption you write, no exceptions):',
  '1. ONE idea per post. Specific beats generic: name real products/services of the business (the ones in its profile and DNA). Never "our products", "the best", "top quality" without saying WHAT.',
  '2. A concrete CTA, ALWAYS: one real, doable action ("message us on WhatsApp", "book your appointment", "stop by the shop"). Never an empty CTA ("don\'t miss out!", "check it out", "contact us") and never a bare "come see us": if you invite, say WHEN and HOW.',
  '3. Hashtags: MAXIMUM 5, all relevant to the niche and the post (this overrides any other limit in this prompt). No filler: #love #instagood #photooftheday and other burned-out generics are banned. And ROTATE: never the same hashtag block in two back-to-back posts of the same client.',
  '4. Never close with the same formula twice in a row: vary the final CTA (DM order, question, invitation to the shop) so it does not read like a template.',
  '5. Banned crutch openings: never start with "Hey there!", "Welcome to..." or "Did you know...?" as an automatic formula.',
  '6. The caption has to MATCH what the image shows: do not promise, describe or sell what is not in the photo/video.',
  '7. Write EVERYTHING in American English: never Spanish words, Spanish verb forms, inverted punctuation marks or Rioplatense wording — the quality gate rejects any Spanish leak, always.',
  '8. No SHOUTING: never use ALL CAPS for emphasis in the body ("YOUR photos", "IT IS READY"); if something deserves emphasis, the sentence says it, not the format. No asterisks for emphasis (*like this*): on Instagram they show literally and give away that an AI wrote it.',
  '9. ROTATE your own devices across back-to-back posts of the same client: the emoji does not always sit in the same place (sometimes in the body, sometimes none); the closing device does not always end with the same words; never repeat the same idea-concept two posts in a row (if the previous one closed on the mechanism, this one takes it as known or closes on another idea). Never repeat the POSSESSIVE INVENTORY ("your X, your colors" / "your photos, your colors") in back-to-back posts: name ONE concrete thing of the business or describe the scene without listing possessives. And never repeat the FULL SKELETON of the mechanism paragraph (invitation + "tell us" + "send your photos" + "in minutes you have 5 posts" + "retouch over chat"): if the previous post already explained how it works, this one takes it as known or tells it with another structure. But rotate the FORM, not the MEANING: when varying, do not swap the action verb for an imprecise synonym (the posts are to look at/approve, never "to give feedback on") and never chain 3 imperatives in a row (it reads like a tutorial, not a person); and never open a paragraph with a disclaimer ("here is an invented example", "just so you get it"): the sample is woven into the sentence or goes at the end. If the synonym sounds off, go back to the simple word. Rotation is measured on the EXACT PHRASES and the IDEA, not only on the kind or position of the device: never repeat lexical anchors in back-to-back posts, and never close the mechanism with the same idea even if the words change. Moving a repeated phrase somewhere else is not rotating it. Humans do not repeat their own devices; repetition is the most visible AI signature.',
  '10. The first line never stitches a FOREIGN HEADLINE: the opening topic is a short, concrete noun from the business ("the brunch", "the hair treatment"), never the headline of another post or a verb phrase ("What our users say...", "Tips to optimize...", "A day in the life of..."). If your opening names the business twice or carries a common word capitalized mid-sentence, it is spliced: rewrite it with a noun topic before delivering.',
  '11. The BODY goes through the gate too: the crutch ban of item 5 applies to EVERY sentence, not only the first one (a crutch question opens NO sentence of the caption); no empty superlatives without a fact ("it deserves the best" without saying what, how much or when) and no burned phrases ("makes all the difference" without saying how); and within the SAME week no post opens with the same device as another: a "How many times has this happened to you...?"-style device is worth ONCE a week, not in four posts — vary the opening formula among posts of the same batch (scene, fact, statement, a different question).',
  '12. The opening device counts in ANY position: the week\'s opening device (a "how many times have you...?", "have you ever wondered...?", "can you imagine...?" question) is worth once a week in ANY sentence of the caption, not only in the first line: do not hide it as the second sentence.',
  '13. Never corporate brochure verbs: no "boost", "leverage" or "elevate" applied to the business, its account or its sales — no owner talks about their business like that, and the gate rejects empty corporate speak. If you want to say something will do better, say WHAT happens concretely: which post gets pushed, with what budget, for what date.',
  '14. No EMPTY BINOMIALS: never pairs of abstract brochure nouns joined by "and" — "elegance and functionality", "quality and design", "style and comfort" — the gate rejects them always. An owner does not describe their product with two abstractions: they say the concrete thing that makes it good (the material, the size, the use, how long it lasts). Concrete pairs are fine ("tables and chairs", "cut and beard").',
  '15. COMPLETE LISTS OR NONE: if you announce an enumeration ("the 3 mistakes...", "follow these ideas"), write EVERY item with its text on the same line — never an empty item ("...: 1." and jump to the CTA, or a caption closing on a bare "3."): the gate rejects it always. If they do not all fit, do not enumerate: tell the main idea in one sentence. And the topic after "after trying..." is always a concrete business noun, never a verb phrase or a command.',
  '16. AFTER A FORMULA PREPOSITION NEVER GOES A COMMAND: if your opening is a formula ("The mistake almost everyone makes with...", "The secret ingredient of...", "It came for..."), what follows "with / of / for / about" is a lowercase noun of the business ("with the coffee", "of the house"), never a capitalized order: that is a splice — two sentences stitched — and the lint stops it. If the topic you want is a verb phrase, rewrite the whole opening as one sentence of your own, with no formula.',
  '17. NO FRONTED FRAGMENTS: never open with a time adverb + dangling adjective ("In the morning strong, we serve..."): no human orders a sentence like that — it is the signature of a generator fronting a piece of the topic. Say the sentence in natural order ("To start the morning strong, we serve...", "In the morning, the coffee comes out...").',
  '18. IF YOU ANNOUNCE A NUMBER, DELIVER THAT NUMBER: if you say "3 tips", "the 3 mistakes" or "5 steps", the caption carries EXACTLY that many numbered items — never just one under an announcement of three. If they do not all fit, do not announce the number: tell it in prose ("first..., then...") or write the full list.',
  '19. AFTER "AFTER TRYING" GOES THE PRODUCT, NOT THE LABEL: if the opening is "What a customer told us after trying...", what follows is a concrete business noun ("the hair treatment", "the croissants"), never the generic label of another post capitalized with its sentence behind it — that is a splice: two texts stitched. A short proper name ("Café Aroma") or a lowercase topic pass clean.',
  '20. NO EMPTY PROMISES: never "make your life easier" or "hassle-free"/"without complications" — they are template filler, not an advantage. If you want to say something is easy, state THE FACT: what gets done, by when, with what effort spared for the client.',
  '21. THE PERIOD IS NOT PART OF THE NAME: if the profile stores the name with a trailing period ("Posty."), the name is "Posty": never write that period as if it were part of the name mid-sentence, and never use it to hide naming the business twice in the same opening — name it ONCE per opening. The period only closes a sentence; it never travels with the name inside one.',
  '22. SWAPPING THE WORDS DOES NOT CHANGE THE CLICHÉ: "You don\'t want to miss this one" is exactly the same empty CTA as "Don\'t miss out" — if you want urgency, use the concrete fact (it ends today, only a few left, it comes out of the oven at a set time), never the cliché with another wording.',
  '23. NO PREFABRICATED CONFESSION: never "To be honest with you:" as a preamble — the confession says nothing: go straight to the fact ("the secret is in the well-built quotes", "every cup comes from...") without announcing that you are about to be honest. The gate rejects the prefabricated confession always.',
  '24. THE BRIEF IS NEVER PUBLISHED: the internal business brief (literal product, post goal, voice, prices in posts, where to find them) is raw material for writing, NEVER caption text. If your draft carries a brief label, delete it whole and write the sentence in your own words: the customer reads the post, not the brief. Neither are the engine\'s echo lines caption text — "In your words: ..." / "As you asked: ..." are internal notes that close a draft and are NEVER published: if your draft carries one, delete it whole; the customer\'s voice goes in the body, not as a label at the end. The gate rejects those lines always.',
  '25. THE BRAND IN CAPS IS NOT SHOUTING, AND FORMULAS NEVER STITCH TO A TOPIC WITH AN ARTICLE (BRAND-CAPS / EN-SPLICE): if the business name is spelled in capitals (VEJA, BYREDO), naming it that way is fine — the gate masks the exact business name before the shouting check in both languages. What stays shouting is caps emphasis on words that are not the brand. And the tip formula never stitches to a topic that carries an article: "choosing your the salar well" (real id 656, VEJA, 2026-11-13) is a splice — the topic goes in clean ("Salar") or the opening is rewritten whole; the EN gate rejects it as a spliced opening.',
  '26. NO CROSS-ACCOUNT TEMPLATE, NO GENERIC STAR (CROSS-TEMPLATE / GENERIC-STAR): never "[product], another favorite at [business]" or "[product], another service at [business]" — that exact skeleton ran across six different businesses in two days (real ids 660/663/666/669/677, 2026-11-13/14): when the same sentence fits every business, it says nothing about yours; name the product and say one concrete thing about it. And never crown a generic category word as the star: "Bar is one of the most requested things at..." / "cafe is one of the most requested..." (real ids 678/641) — the star is a real product with a name ("our house blend", "the Salar"), or there is no post. The EN gate rejects both.',
  '27. NO WEB CHROME, NO EMPTY TIP SKELETON (WEB-CHROME / TIP-SKELETON): the body is a sentence about the product, never the website\'s baked text — not the navigation label ("Shop All Jewelry – Solid Gold, Silver, Diamonds & More.", real id 662, MEJURI, published) and not the meta description ("The Ordinary is your destination for Skincare, Makeup, Hair, and Body solutions.", real id 668, published). And if a tip announces keys, the keys are concrete facts of THIS product (fit, sole, how it ages), never the virtue skeleton "Quality, detail and the [business] standard: that\'s how we do X" — that exact body ran across VEJA, MEJURI, Jeni\'s and Tartine (real ids 661/664/667/672). The EN gate rejects all three.',
  '28. NO BROCHURE CTA, NO EMPTY CLICHÉ (WEB-CHROME-CTA / SHARE-THE-LOVE): never close with the website talking — a block opening "Visit our website to explore..." is the brochure\'s CTA, not the post\'s (real id 687, Jeni\'s, 2026-11-16: it named no product and passed the gate whole). The post closes with ONE concrete action (DM, comment, save, stop by the store). And never "share the love": it says nothing about what is shared or with whom — if you want sharing, name the person and the thing ("send this to the friend who always orders the second scoop"). The EN gate rejects both; mentioning the website mid-sentence and "share this post" stay legal.',
  '29. NO BROCHURE MAGIC (ASEGURADOR-CLICHÉ): never "let\'s make some magic happen", never "we bring your visions to life" / "we\'ll bring it to life", never "join our community of happy customers", never open with "Looking for a sweet escape?" — that is brochure filler with zero facts about the business (real ids 704/705/707, Scorpion Studios and Big Top Candy Shop, 2026-11-17: the EN gate let 704 and 707 through whole). Say the concrete thing instead: the product, the craft, the address, the hour. A real testimonial ("our happy customers keep coming back for the fudge") stays legal — what is banned is the filler phrase, not the words. The EN gate rejects all five signatures.',
  '30. HASHTAGS BELONG TO THIS BUSINESS\u2019 NICHE (HASHTAGS-RUBRO): the hashtags field is read as part of the post and indexed as such — a set from another niche is a defect of the whole post, not a detail (real id 700, Bill Lawrence Salon, a Washington DC hair salon whose caption is about cuts and color, published 2026-11-18 with #beautyroutine #selfcare #skincare #glowingskin: the skincare set on a hair salon; real id 701, All Life is Yoga, published the same day with #training #personaltrainer #gymlife #fitness: the gym set on a yoga studio). Before closing the post, check the set against the business and against THIS caption: if two or more tags belong to another niche\u2019s family (skincare when nothing talks about skin; gym on a yoga/pilates business), the set is wrong — write the real niche\u2019s tags (the salon: cuts, color, hair; the yoga studio: yoga, the practice, the neighborhood). The hashtagsPass gate rejects it whenever the caller passes the field, and the schedule lint runs it on every post. Context rules: an esthetics business that talks about skin uses #skincare fine, and a gym uses #gymlife fine; what is banned is the crossed set, not the word.',
  '31. THE PRICE SHIPS WHOLE OR NOT AT ALL (ORPHAN-PRICE): if a caption carries a price, the reader must be able to read what it costs: currency sign and integer part ("$4.77"). A bare decimal (".77", "0.77" with no sign) is a mutilated price — the transcription lost the sign and the integer, and the post says what nothing costs (real id 712, Big Top Candy Shop, scheduled 2026-11-19: "hand-jerked sodas .77, sundaes .77, the banana split 0.77"; it shipped rewritten WITHOUT prices because the real ones were not in the foundation). If the real price is not in the foundation, the caption goes WITHOUT a price — never with the fragment. The gate (captionPasses/captionPassesEn) rejects it in both languages.',
  '32. THE OPENING DOES NOT REPEAT WITHIN THE WEEK (M79-EN): one opening device per week — the same question family ("how many times…", "did you know…", "have you ever…") or the same first three words of a declarative opening never open two posts of the same batch (real ids 735/739, RAZOR RICK, 2026-11-20/22: id 739 was scheduled with the exact headline of id 735, "old school skill. modern style.", published two days earlier — the EN gate only knew the exact-duplicate check and let the repeated headline through). A series opener that moves ("day two: the calzone" → "day three: the slice") is fine: what repeats is the device, not the series. The EN gate (captionPassesEn) now rejects it whenever the caller passes the week\u2019s previous captions, mirroring the Spanish door\u2019s M79 check.',
  '33. A REPEATED DEVICE SHOWS EVEN WITHOUT A CTA (CLASH-PARITY): the poster format carries no CTA by design, but that never hides a repeated opening: if your caption opens with the same device as another post of the same week (the same question family or the same first three words), the gate rejects it FOR THE DEVICE, before the CTA check — in both languages, and also in the last-moment re-check before scheduling (captionWeekClash now picks the gate by the caption language since 2026-11-21; it used to always run the Spanish gate, so a repeated English headline, like id 739 against id 735, passed as a CTA note). One use of the device per week, with or without a CTA.',
  '34. A LONG OPENING IS NOT A SPLICE (LINT v13): if the first sentence runs past 26 words, the problem is LENGTH, not a seam: the sentence can be perfectly clean and still read in one breath (real id 741, 2026-11-21: the series formula plus a long product name pushed it to 27). Shorten by dropping ONE detail (the business is already in the image) or split it into two sentences — never rewrite hunting for a splice that is not there. The gate rejects it under its own reason ("long opening") since 2026-11-22; it used to report it as a splice and the retry unstitched air.',
].join('\n');

function isArgentineClient(db, userId) {
  try {
    const s = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId) || {};
    const tz = String(s.timezone || '');
    return /argentina|buenos[\s_]?aires|c[oó]rdoba|mendoza|rosario|tucum[aá]n/i.test(tz);
  } catch (_) { return false; }
}

async function textAnalyze(apiKey, captions, userId) {
  const numbered = captions.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
  const body = {
    model: CAPTION_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: `Analizá estos ${captions.length} captions y devolvé el JSON de perfil de escritura:\n\n${numbered}` },
    ],
  };

  async function callOnce(extraInstruction) {
    const b = extraInstruction
      ? { ...body, messages: [...body.messages, { role: 'user', content: extraInstruction }] }
      : body;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(60000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || `OpenAI ${r.status}`);
    if (costs && costs.trackUsage) {
      try { costs.trackUsage({ feature: 'caption-style', userId, model: CAPTION_MODEL, json: data }); } catch (_) {}
    }
    return data;
  }

  let data = await callOnce(null);
  let parsed = parseProfile(data);
  if (!parsed) {
    // 1 reintento pidiendo solo JSON válido
    data = await callOnce('El JSON anterior vino roto. Devolvé SOLO JSON válido, sin texto extra.');
    parsed = parseProfile(data);
  }
  if (!parsed) throw new Error('caption JSON inválido');
  return parsed;
}

function parseProfile(data) {
  try {
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (!content) return null;
    const j = JSON.parse(content);
    const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');
    const tone = str(j.tone);
    if (!tone) return null; // sin tono no hay perfil útil
    const avg = parseInt(j.avg_length, 10);
    return {
      tone,
      emoji_style: str(j.emoji_style) || 'variado',
      avg_length: Number.isFinite(avg) && avg > 0 ? Math.min(avg, 500) : 0,
      cta_style: str(j.cta_style) || 'variado',
      hashtag_style: str(j.hashtag_style) || 'variado',
      opening_style: str(j.opening_style) || 'variado',
      persona: str(j.persona) || 'variado',
    };
  } catch (_) {
    return null;
  }
}

async function analyzeCaptionStyle(db, userId) {
  try {
    const creds = getCreds(db, userId);
    if (!creds) return { ok: false, error: 'sin IG conectado' };

    const apiKey = getOpenAiKey(db, userId);
    if (!apiKey) return { ok: false, error: 'sin clave OpenAI' };

    // Últimos posteos del IG conectado: solo importa el texto (caption).
    const IG_HOST = 'https://graph.instagram.com';
    const API_VERSION = 'v26.0';
    const media = await (async () => {
      const q = new URLSearchParams({
        access_token: creds.accessToken,
        fields: 'id,media_type,caption,timestamp',
        limit: '12',
      }).toString();
      const r = await fetch(`${IG_HOST}/${API_VERSION}/${creds.igUserId}/media?${q}`, { signal: AbortSignal.timeout(25000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error((data.error && data.error.message) || `IG ${r.status}`);
      return data;
    })();

    const items = Array.isArray(media.data) ? media.data : [];
    const captions = [];
    for (const m of items) {
      const c = String(m.caption || '').replace(/\s+/g, ' ').trim();
      if (c.length >= 20 && captions.length < MAX_CAPTIONS) captions.push(c.slice(0, 400));
      if (captions.length >= MAX_CAPTIONS) break;
    }
    if (captions.length < MIN_CAPTIONS) {
      return { ok: false, error: `pocos captions en el feed (${captions.length}, mínimo ${MIN_CAPTIONS})` };
    }

    const profile = await textAnalyze(apiKey, captions, userId);
    const analyzed_at = new Date().toISOString();
    profile.analyzed_at = analyzed_at;
    profile.caption_count = captions.length;

    db.prepare(`INSERT INTO ig_caption_style (user_id, profile_json, analyzed_at)
      VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, analyzed_at=excluded.analyzed_at`)
      .run(userId, JSON.stringify(profile), analyzed_at);

    return { ok: true, profile, analyzed_at };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'error desconocido' };
  }
}

function getCaptionStyle(db, userId) {
  try {
    const row = db.prepare('SELECT profile_json, analyzed_at FROM ig_caption_style WHERE user_id = ?').get(userId);
    if (!row || !row.profile_json) return null;
    const profile = JSON.parse(row.profile_json);
    if (!profile || typeof profile !== 'object' || !profile.tone) return null;
    if (!profile.analyzed_at && row.analyzed_at) profile.analyzed_at = row.analyzed_at;
    return profile;
  } catch (_) {
    return null;
  }
}

function captionStyleBlock(profile) {
  try {
    if (!profile || typeof profile !== 'object') return '';
    const tone = typeof profile.tone === 'string' ? profile.tone.trim() : '';
    if (!tone) return '';
    const lines = [
      'ESCRIBÍ COMO EL CLIENTE (así escribe en su Instagram real — tus captions DEBEN sonar como los suyos, no como una plantilla genérica):',
      `- Tono: ${tone}`,
    ];
    if (profile.emoji_style && profile.emoji_style !== 'variado') lines.push(`- Emojis: ${profile.emoji_style}`);
    if (profile.avg_length) lines.push(`- Largo típico: ~${profile.avg_length} palabras`);
    if (profile.cta_style && profile.cta_style !== 'variado') lines.push(`- CTA típico: ${profile.cta_style}`);
    if (profile.hashtag_style && profile.hashtag_style !== 'variado') lines.push(`- Hashtags: ${profile.hashtag_style}`);
    if (profile.opening_style && profile.opening_style !== 'variado') lines.push(`- Apertura típica: ${profile.opening_style}`);
    if (profile.persona && profile.persona !== 'variado') lines.push(`- Persona: ${profile.persona}`);
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

// Todo lo que se inyecta al system prompt de caption para un usuario:
// SIEMPRE el checklist; el bloque de estilo solo si hay perfil analizado;
// línea rioplatense dura si el timezone del cliente es argentino.
// (CORRECTIVO-3) Con lang 'en' (el CONTENIDO de la marca es en inglés):
// el checklist es el espejo EN y la línea rioplatense NO se agrega — el
// reglamento en español dentro de un prompt en inglés era la masa que
// empujaba al modelo a escribir el cuerpo en español. Sin lang o con
// 'es': comportamiento histórico, byte a byte.
function captionPromptExtras(db, userId, lang) {
  const en = lang === 'en';
  try {
    const parts = [en ? CAPTION_CHECKLIST_EN : CAPTION_CHECKLIST];
    let ar = false;
    if (!en) { try { ar = isArgentineClient(db, userId); } catch (_) {} }
    if (ar) parts.push('IDIOMA: el cliente es argentino — escribí TODO en rioplatense con voseo ("vos").');
    let block = '';
    try { block = captionStyleBlock(getCaptionStyle(db, userId)); } catch (_) {}
    if (block) parts.push(block);
    return parts.join('\n\n');
  } catch (_) {
    return en ? CAPTION_CHECKLIST_EN : CAPTION_CHECKLIST;
  }
}

module.exports = {
  analyzeCaptionStyle,
  getCaptionStyle,
  captionStyleBlock,
  captionPromptExtras,
  isArgentineClient,
  CAPTION_CHECKLIST,
  CAPTION_CHECKLIST_EN,
};
