// Generador de contenido — Posta
// Usa OpenAI si hay API key configurada, si no usa el motor de plantillas local
// con voz argentina (voseo).

// Detecta si un texto es un brief/instrucción en vez de copy ("Compartí un carrusel con...").
// Eso nunca se imprime en un diseño.
function looksLikeBrief(t) {
  const s = String(t || '').trim().toLowerCase();
  return /^(compart[íi]|public[áa]|hac[ée]|sub[íi]|mostr[áa]|cont[áa]|cre[áa]|escrib[íi]|arm[áa]|sac[áa]|grab[áa]|poste[áa]|eleg[íi]|us[áa]|prob[áa])\b/.test(s)
    || /\b(carrusel con|posteo sobre|hacé un post)\b/.test(s);
}
// Corta un texto SIN partir palabras a la mitad (nunca "efecti").
function cortar(t, max) {
  const s = String(t || '').trim();
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  const i = c.lastIndexOf(' ');
  return (i > max * 0.4 ? c.slice(0, i) : c).trim();
}
const HOOKS = {
  canchero: [
    'Che, mirá esto 👀',
    'Te lo muestro sin vueltas 👇',
    'Esto se va a agotar 🔥',
    'Precio amigo, calidad de verdad 💥',
    'Lo que pedían, llegó ✨',
  ],
  profesional: [
    'Te presentamos nuestra novedad',
    'Calidad que se nota en cada detalle',
    'Tu mejor opción, siempre',
    'Compromiso y excelencia en cada entrega',
  ],
  divertido: [
    'Alerta de antojo 🚨',
    'Tu billetera me va a odiar 😂',
    'Esto es un peligro (del bueno) ⚠️',
    'Confirmado: lo necesitás en tu vida ✅',
  ],
};

const CTAS = {
  canchero: [
    'Escribinos por DM y te lo reservamos 📩',
    'Comentá INFO y te pasamos todo 👇',
    'Guardá este post para no olvidarte 🔖',
    'Etiquetá a quien lo necesita 🙋',
  ],
  profesional: [
    'Contactanos para más información 📩',
    'Visitá nuestro perfil y conocé más',
    'Te esperamos, reservá tu lugar',
  ],
  divertido: [
    'Corré antes de que vuele 🏃💨',
    'Dale like si ya lo querés ❤️',
    'Compartilo con tu grupo de WhatsApp 📲',
  ],
};

const HASHTAGS = {
  ropa: ['#modaargentina', '#tiendaderopa', '#ootd', '#emprendedoresargentinos', '#comprelocal'],
  gastronomia: ['#foodieargentina', '#gastronomia', '#buenosairesfood', '#antojo', '#restaurante'],
  fitness: ['#fitnessargentina', '#entrenamiento', '#gymlife', '#vidasana', '#personaltrainer'],
  servicios: ['#servicios', '#emprendedoresargentinos', '#trabajoargentino', '#oficios', '#recomendado'],
  mascotas: ['#mascotasargentinas', '#doglover', '#gatosdeinstagram', '#petshop', '#mascotasfelices'],
  viajes: ['#viajesargentina', '#turismoargentina', '#viajeros', '#escapadas', '#travelgram'],
  belleza: ['#bellezaargentina', '#makeup', '#skincare', '#peluqueria', '#estetica'],
  cafeteria: ['#cafedeespecialidad', '#coffeeholic', '#cafeenbuenosaires', '#brunch', '#cafeteria'],
  barberia: ['#barberiaargentina', '#barberia', '#barberlife', '#cortedepelo', '#estilomasculino'],
  salud: ['#saludargentina', '#bienestar', '#vidasaludable', '#saludintegral', '#cuidatusalud'],
  educacion: ['#educacionargentina', '#cursosonline', '#capacitacion', '#aprendeencasa', '#educacion'],
  tecnologia: ['#tecnologiaargentina', '#tech', '#innovacion', '#startupsargentina', '#digital'],
  hogar: ['#hogarargentina', '#decoracion', '#decohome', '#interiorismo', '#hogardulcehogar'],
  inmobiliaria: ['#inmobiliariaargentina', '#propiedades', '#realestateargentina', '#ventadepropiedades', '#inversion'],
  eventos: ['#eventosargentina', '#fiestas', '#organizaciondeeventos', '#casamientos', '#eventplanner'],
  arte: ['#arteargentina', '#artistasargentinos', '#disenografico', '#artecontemporaneo', '#creatividad'],
  otro: ['#emprendedoresargentinos', '#pymesargentina', '#argentina', '#negociosdigitales'],
};

const GENERIC_TAGS = ['#argentina', '#emprendedor', '#marketingdigital'];

// ---------- Energía extra (Creador v2): hooks, CTAs y beneficios con punch ----------
const ENERGY_HOOKS = {
  canchero: [
    'Pará todo lo que estás haciendo 🛑',
    'Te lo digo de una: lo necesitás 💥',
    'Mirá esto y después me contás 🤩',
    'Si te gusta lo bueno, seguí leyendo 👀',
    'Alerta: esto vuela 🚨',
    'Lo que estabas esperando, llegó ✨',
    'No digas que no te avisamos ⚡',
    'Recién llegado y ya es favorito 🔥',
  ],
  profesional: [
    'Presentamos lo último de nuestra colección',
    'Diseñado para quienes eligen calidad',
  ],
  divertido: [
    'Tu tarjeta me va a pedir perdón 💳😂',
    'Peligro: antojo nivel experto ⚠️',
  ],
};

const ENERGY_CTAS = {
  canchero: [
    'Pedilo por DM antes de que vuele 📩',
    'Comentá QUIERO y te lo reservamos 👇',
    'Guardalo, porque después lo vas a buscar 🔖',
    'Compartilo con quien lo necesita 🙌',
  ],
  profesional: ['Escribinos y te asesoramos 📩'],
  divertido: ['Dale que vuelan 🏃💨'],
};

const ENERGY_BENEFITS = [
  'Stock limitado, no te quedes afuera ⚡',
  'Calidad premium que se nota en cada detalle ✨',
  'Precio de lanzamiento solo por esta semana 💥',
  'Te lo enviamos a todo el país 📦',
  'Si no te enamora, te devolvemos la plata ✅',
];

const GOAL_LINES = {
  vender: 'Objetivo principal: VENDER. Cada propuesta tiene que traer clientes y ventas: promos, urgencia, prueba social y llamados a la compra directos.',
  seguidores: 'Objetivo principal: CRECER EN SEGUIDORES. Cada propuesta tiene que maximizar alcance e interacción: contenido guardable y compartible, que invite a seguir la cuenta.',
  lanzamiento: 'Objetivo principal: LANZAMIENTOS. Cada propuesta tiene que anunciar novedades y promos con fuerza: expectativa, revelación y urgencia.',
  fidelizar: 'Objetivo principal: FIDELIZAR CLIENTES. Cada propuesta tiene que hacer que los clientes vuelvan: comunidad, beneficios para clientes frecuentes, contenido que genere vínculo y pertenencia.',
  referente: 'Objetivo principal: SER REFERENTE. Cada propuesta tiene que posicionarte como experto en tu rubro: contenido educativo, tips, autoridad y confianza.',
};
const GOAL_CTAS = {
  vender: 'Escribinos por DM y compralo hoy 📩',
  seguidores: 'Seguinos para no perderte nada ➕',
  lanzamiento: 'No te quedes afuera: pedilo ya 🚀',
  fidelizar: 'Volvé pronto: tenemos algo para vos 💛',
  referente: 'Guardá este tip de experto 🔖',
};
const goalLine = g => (GOAL_LINES[g] ? '\n' + GOAL_LINES[g] : '');

// Mix de contenidos de la semana: cada idea lleva un tipo para que la semana
// no sea toda promo (o toda tips). Se inyecta al prompt del caption como GOAL_LINES.
const TIPO_LINES = {
  promo: 'PROMO: oferta concreta con precio/beneficio claro y urgencia real.',
  tip: 'Contenido EDUCATIVO: enseña algo útil del rubro, tono de experto generoso.',
  social: 'PRUEBA SOCIAL: muestra clientes contentos, resultados, testimonios.',
  detras: 'DETRÁS DE ESCENA: muestra el lado humano del negocio, el proceso, el equipo.',
  novedad: 'NOVEDAD: anuncia algo nuevo con expectativa, como un lanzamiento.',
};
const tipoLine = t => (TIPO_LINES[t] ? '\n' + TIPO_LINES[t] : '');

const TIPOS = ['promo', 'tip', 'social', 'detras', 'novedad'];
// Familias de concepto visual por tipo de contenido: las usa el motor de
// imágenes nivel agencia (/api/concept-shot) para dirigir la generación.
const CONCEPT_FAMILIES = {
  promo: 'oferta irresistible, producto héroe en escena',
  tip: 'editorial limpio y conceptual',
  social: 'prueba social, escena real y cálida',
  detras: 'detrás de escena fotorrealista',
  novedad: 'anuncio impactante de lanzamiento',
};
// Garantía dura de variedad: nunca dos ideas seguidas con el mismo tipo.
function fixTipos(ideas) {
  let prev = null;
  return (ideas || []).map((idea, i) => {
    let t = TIPOS.includes(idea.tipo) ? idea.tipo : TIPOS[i % TIPOS.length];
    if (t === prev) t = TIPOS[(TIPOS.indexOf(t) + 1) % TIPOS.length];
    prev = t;
    return { ...idea, tipo: t };
  });
}

function stripEmojis(s) {
  return String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/ {2,}/g, ' ');
}

// Caption con energía a partir de plantillas. `seed` varía hook/CTA/beneficio;
// `feedback` permite ajustes ("más corto", "sin emojis", "más divertido"...).
function templateCaption({ business, category, tone, topic, feedback, seed, goal }) {
  const fb = String(feedback || '');
  let t = /divert|gracios/i.test(fb) ? 'divertido' : (/profesion|seri[oa]|elegante/i.test(fb) ? 'profesional' : (HOOKS[tone] ? tone : 'canchero'));
  const hooks = [...(HOOKS[t] || HOOKS.canchero), ...(ENERGY_HOOKS[t] || [])];
  const ctas = [...(CTAS[t] || CTAS.canchero), ...(ENERGY_CTAS[t] || [])];
  const hook = hooks[seed % hooks.length];
  const cta = GOAL_CTAS[goal] || ctas[(seed * 3 + 1) % ctas.length];
  const benefit = ENERGY_BENEFITS[seed % ENERGY_BENEFITS.length];
  const biz = business ? ` en ${business}` : '';
  const topicLine = `${String(topic).charAt(0).toUpperCase()}${String(topic).slice(1)}${biz}.`;
  const short = /cort/i.test(fb);
  const long = /larg/i.test(fb);
  let caption;
  if (short) caption = `${hook}\n\n${topicLine}\n\n${cta}`;
  else if (long) caption = `${hook}\n\n${topicLine}\n\n${benefit}\n${ENERGY_BENEFITS[(seed + 2) % ENERGY_BENEFITS.length]}\n\n${cta}`;
  else caption = `${hook}\n\n${topicLine}\n\n${benefit}\n\n${cta}`;
  if (/sin emoji|menos emoji/i.test(fb)) caption = stripEmojis(caption).trim();
  return caption;
}

// Estándar de calidad Posta: si vendemos posteos, tienen que ser los mejores.
// El prompt enseña TÉCNICA concreta, prohíbe los tics de IA y muestra ejemplos.
const CAPTION_CRAFT = `
Escribís captions de Instagram en español rioplatense con voseo, para negocios reales argentinos.
Tono: cercano y canchero, como el dueño del local hablando con un cliente amigo. Nunca corporativo, nunca genérico.

TÉCNICAS DE HOOK (elegí UNA por caption, la que mejor pegue con el tema):
- Pregunta que duele o da curiosidad: "¿Cuántas veces te pasó que...?"
- Número concreto: "3 errores que...", "Solo quedan 5"
- Confesión o detrás de escena: "Te voy a ser honesto..."
- Contraste: "Antes lo hacíamos así. Ahora..."
- Directo sin humo: el producto + el beneficio en una línea.

REGLAS DE ORO:
- Sé ESPECÍFICO: nombrá el producto, el precio si hay promo, el día, el lugar. Lo genérico no vende.
- Variá la ESTRUCTURA: algunos captions cuentan una mini historia, otros son una lista corta, otros van directo en 2-3 líneas. Nunca repitas la misma estructura en captions seguidos.
- 1 o 2 emojis bien puestos, nunca más. Cada emoji tiene que sumar, no decorar.
- El CTA es UNA acción concreta: escribinos, comentá X, guardalo, pasá por el local.
- Adaptá el vocabulario al rubro: una parrilla habla de fuego y juntadas; una boutique, de estilo y ocasiones; un gimnasio, de constancia y resultados.

PROHIBIDO (suena a IA, está quemado):
- "En el mundo actual" / "En el mundo de hoy"
- "¿Estás listo para llevar tu X al siguiente nivel?"
- "¡No te lo podés perder!" / "¡No te lo pierdas!"
- "Sumergite", "Descubrí el poder de", "Desbloqueá tu"
- "Te presentamos" / "Les presentamos" / "Atención, que"
- Preguntas retóricas vacías ("¿A quién no le gusta...?")
- "Mirá lo que tenemos para vos"

EJEMPLOS del nivel esperado:
1. "El vacío del domingo no se discute. 🔥 Vuelta y vuelta, chimichurri de la casa y la mesa llena. Reservá por DM que los domingos vuelan."
2. "3 cosas que nadie te dice antes de teñirte de rubio 👇 1. El retoque es cada 3 semanas. 2. Sin matizador se pone naranja. 3. Con nosotras no te pasa ninguna. Turnos por DM."
3. "Llegaron las camperas de cuero. Nada más que decir. Bueno sí: quedan 6. Te esperamos en el local o pedila por DM."
`.trim();

const ENERGY_SYSTEM = (n) =>
  `Sos un redactor publicitario argentino experto en Instagram que vende de verdad.\n${CAPTION_CRAFT}\n` +
  `Respondé SOLO con un JSON: {"captions": ["...", ...], "overlays": ["...", ...], "hashtags": "#tag1 #tag2 ..."}. ` +
  `"overlay" es el titular de MÁXIMO 5 palabras que va SOBRE la imagen: corto, con punch, sin emojis (ej: "2X1 ESTE FINDE", "LLEGÓ LO NUEVO", "HASTA 40% OFF"). ` +
  `Generá exactamente ${n} captions DISTINTOS entre sí (distinta técnica de hook y distinta estructura). ` +
  `Hashtags: máximo 8, mezclá grandes, de nicho y locales.`;

// Frases prohibidas (extraídas del PROHIBIDO de CAPTION_CRAFT): suenan a IA y están quemadas.
// Se matchean sin acentos y en minúsculas.
const BANNED_PHRASES = [
  'en el mundo actual',
  'en el mundo de hoy',
  'al siguiente nivel',
  'no te lo podes perder',
  'no te lo pierdas',
  'sumergite',
  'descubri el poder de',
  'desbloquea tu',
  'te presentamos',
  'les presentamos',
  'atencion, que',
  '¿a quien no le gusta',
  'mira lo que tenemos para vos',
];

// Señales de CTA (sin acentos): el caption tiene que pedir UNA acción concreta.
// 'dm' se chequea aparte con word boundary para no matchear "admirar", etc.
const CTA_SIGNALS = ['comenta', 'guarda', 'escribinos', 'pasa por', 'link', 'turno', 'pedilo', 'reserva'];

// Puerta de calidad automática: el cliente nunca ve un caption mediocre.
// Devuelve { ok, reason }.
function captionPasses(caption) {
  const c = String(caption || '');
  const low = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const p of BANNED_PHRASES) {
    if (low.includes(p)) return { ok: false, reason: `contiene la frase quemada "${p}"` };
  }
  if (c.trim().length < 40) return { ok: false, reason: 'es demasiado corto (menos de 40 caracteres)' };
  if (hasPlaceholders(c)) return { ok: false, reason: 'contiene texto inventado o de ejemplo (tipo "XYZ")' };
  const hasCta = CTA_SIGNALS.some(s => low.includes(s)) || /\bdm\b/.test(low);
  if (!hasCta) return { ok: false, reason: 'le falta un llamado a la acción claro (DM, comentario, guardado…)' };
  return { ok: true, reason: '' };
}

// ---------- Helpers del ADN extendido ("Conocer al cliente a fondo") ----------
// Los campos del ADN pueden venir como string o como array (de strings u objetos):
// productos: [{nombre, precio}], servicios: [...], promos_activas: [...], tono_ejemplos: [...].
function dnaList(v) {
  if (!v) return '';
  const one = (x) => {
    if (x == null) return '';
    if (typeof x === 'string') return x.trim();
    if (typeof x === 'object') {
      const nombre = String(x.nombre || x.name || x.servicio || x.producto || x.titulo || x.texto || x.frase || '').trim();
      const precio = String(x.precio || x.price || '').trim();
      return (nombre + (precio ? ` (${precio})` : '')).trim();
    }
    return String(x).trim();
  };
  const out = Array.isArray(v) ? v.map(one).filter(Boolean).join(' | ') : one(v);
  return out.slice(0, 600);
}
// Línea de learnings: lo que rinde en el Instagram de ESTE cliente.
function learningsLine(l) {
  try {
    const o = (l && typeof l === 'object') ? l : null;
    if (!o) return '';
    const resumen = String(o.resumen || '').trim().slice(0, 300);
    const formato = String(o.mejor_formato || '').trim().slice(0, 60);
    const temas = Array.isArray(o.top_temas)
      ? o.top_temas.map(t => String(t || '').trim()).filter(Boolean).slice(0, 5).join(', ')
      : '';
    if (!resumen && !formato && !temas) return '';
    return `En tu Instagram lo que más rinde es: ${resumen || 'todavía estamos aprendiendo de tu cuenta'} (mejor formato: ${formato || '—'}; temas que funcionan: ${temas || '—'})`;
  } catch (e) { return ''; }
}

// ---------- Contexto del negocio + regla anti-invención ----------
// Se inyecta en TODOS los prompts de generación. Sin datos del negocio, la IA
// tiende a inventar uno entero (el caso "PRODCT XYZ" / power banks): esta regla lo frena.
function businessContext({ business, category, description, dna, tone, learnings }) {
  const d = dna || {};
  const parts = [];
  if (business) parts.push(`Negocio: ${business}`);
  if (category) parts.push(`Rubro: ${category}`);
  if (description) parts.push(`Descripción: ${description}`);
  if (d.producto_estrella) parts.push(`Producto/servicio estrella: ${d.producto_estrella}`);
  if (d.cliente_ideal) parts.push(`Cliente ideal: ${d.cliente_ideal}`);
  if (d.diferencial) parts.push(`Diferencial: ${d.diferencial}`);
  // ADN extendido ("Conocer al cliente a fondo"): lo concreto que vende el negocio.
  const prods = dnaList(d.productos);
  if (prods) parts.push(`Productos: ${prods}`);
  const servs = dnaList(d.servicios);
  if (servs) parts.push(`Servicios: ${servs}`);
  const promos = dnaList(d.promos_activas);
  if (promos) parts.push(`Promos activas: ${promos}`);
  const voz = dnaList(d.tono_ejemplos);
  if (voz) parts.push(`Así habla el dueño: ${voz}`);
  if (d.horarios) parts.push(`Horarios: ${String(d.horarios).slice(0, 120)}`);
  if (d.ubicacion) parts.push(`Ubicación: ${String(d.ubicacion).slice(0, 120)}`);
  const hasData = parts.length > 0;
  parts.push(`Tono: ${d.tono || tone || 'cercano'}`);
  const ctx = hasData
    ? parts.join('\n')
    : '(sin datos del negocio cargados)\nFALTAN DATOS: pedile al cliente el audio de 2 minutos contando de su negocio; no adivines.';
  const learn = learningsLine(learnings);
  return `${ctx}${learn ? '\n' + learn : ''}\nREGLA CRÍTICA: solo podés mencionar productos, servicios, precios, promociones y datos que aparezcan acá arriba. JAMÁS inventes productos, precios ni nombres (nada de "XYZ", "producto X", ni rubros que no te dieron). Si faltan datos, hablá del negocio en general —su propuesta, su atención, su comunidad— sin inventar datos concretos. PROHIBIDO: posteos motivacionales genéricos o frases inspiracionales desconectadas del negocio ("empezá la semana con todo", "nunca te rindas", "emprendé tus sueños"): cada idea tiene que vender algo concreto del negocio o hablarle a su cliente ideal sobre algo real de este negocio.`;
}

// Placeholders típicos de contenido inventado: si aparecen, el texto se descarta.
const PLACEHOLDER_RE = /\bxyz\b|lorem ipsum|producto de (ejemplo|prueba)|nombre del producto|tu producto aqu[ií]|\[[^\]]{2,40}\]/i;
function hasPlaceholders(text) {
  return PLACEHOLDER_RE.test(String(text || ''));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- Datos reales para la IA: rendimiento y mejores horarios ----------
// Brief de rendimiento: top 3 posteos por alcance (últimos 30 días), con formato.
// Para que la IA sepa qué rinde en ESTA cuenta y lo use al proponer.
function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1000) return (Math.round(n / 100) / 10).toString().replace('.', ',') + 'k';
  return String(n);
}
function performanceBrief(db, userId) {
  try {
    const rows = db.prepare(`
      SELECT p.caption, p.media_type, m.reach, m.saved
      FROM post_metrics m
      JOIN posts p ON p.id = m.post_id
      WHERE p.user_id = ? AND p.status = 'published'
        AND p.published_at >= datetime('now', '-30 days')
        AND m.reach > 0
      ORDER BY m.reach DESC LIMIT 3
    `).all(userId);
    if (!rows.length) return '';
    const fmtName = t => t === 'carousel' ? 'carrusel' : t === 'video' ? 'reel' : t === 'story' ? 'historia' : 'posteo';
    const lines = rows.map((r, i) => {
      const cap = String(r.caption || '').split('\n')[0].slice(0, 60).trim() || 'Posteo';
      return `${i + 1}. "${cap}" — ${fmtNum(r.reach)} alcance, ${fmtNum(r.saved)} guardados (${fmtName(r.media_type)})`;
    });
    return `Tus posteos con más alcance (últimos 30 días):\n${lines.join('\n')}`;
  } catch (e) { return ''; }
}
// Voz del cliente: sus 3 captions con más alcance como few-shot de tono y ritmo.
// Menos de 3 → "" (no alcanza para imitar una voz).
function voiceExamples(db, userId) {
  try {
    const rows = db.prepare(`
      SELECT p.caption
      FROM post_metrics m
      JOIN posts p ON p.id = m.post_id
      WHERE p.user_id = ? AND p.status = 'published'
        AND p.published_at >= datetime('now', '-90 days')
        AND m.reach > 0 AND p.caption != ''
      ORDER BY m.reach DESC LIMIT 3
    `).all(userId);
    if (rows.length < 3) return '';
    const lines = rows.map((r, i) => `${i + 1}. "${String(r.caption || '').replace(/\s+/g, ' ').trim().slice(0, 120)}"`);
    return `Escribí con LA VOZ del cliente (ejemplos reales suyos, no los copies, imitá el tono y ritmo):\n${lines.join('\n')}`;
  } catch (e) { return ''; }
}
// Mejores horarios medidos (users.best_hour, lo calcula refreshBestHours).
// Sin IG conectado no hay medición real → "".
function bestHoursLine(db, userId) {
  try {
    const s = db.prepare('SELECT ig_user_id FROM settings WHERE user_id = ?').get(userId) || {};
    if (!s.ig_user_id) return '';
    const u = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(userId) || {};
    const h = parseInt(u.best_hour, 10);
    if (!h || h < 9 || h > 21) return '';
    return `Tus mejores horarios para publicar: ${h}h.`;
  } catch (e) { return ''; }
}

function templateGenerate({ business, category, tone, topic, goal }) {
  const t = HOOKS[tone] ? tone : 'canchero';
  const caption = templateCaption({ business, category, tone: t, topic, feedback: '', seed: Math.floor(Math.random() * 1000), goal });
  const overlay = String(topic).split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD';
  const tags = [...(HASHTAGS[category] || HASHTAGS.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return { caption, overlay, suboverlay: String(caption).split('\n')[0].slice(0, 140), hashtags: tags.join(' ') };
}

async function openaiGenerate({ business, category, description, dna, tone, topic, competitors, goal, taste, tipo, feedback, performance, styleRules, voice }, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Sos un redactor publicitario argentino experto en Instagram que vende de verdad.\n' +
            CAPTION_CRAFT +
            '\nRespondé SOLO con un JSON: {"caption": "...", "overlay": "...", "suboverlay": "...", "hashtags": "#tag1 #tag2 ..."}. ' +
            '"overlay" es el titular de MÁXIMO 5 palabras que va SOBRE la imagen: corto, con punch, sin emojis. ' +
            '"suboverlay" es la bajada de MÁXIMO 12 palabras que va DEBAJO del titular: tiene que ser COPY del posteo, lo que leería un seguidor (ej: "Probalo antes de que vuele, quedan pocos"). ' +
            'PROHIBIDO que la bajada sea una instrucción o descripción de la tarea: nunca "Compartí un carrusel con…", "Publicá una foto de…", "Hacé un posteo sobre…". ' +
            'Hashtags: máximo 8, mezclá grandes, de nicho y locales.',
        },
        {
          role: 'user',
          content: businessContext({ business, category, description, dna, tone }) +
            `\nTema del post: ${topic}\nCompetidores: ${competitors || 'no indicados'}${goalLine(goal)}${tipoLine(tipo)}${taste || ''}` +
            (performance ? `\nRendimiento real de tu cuenta:\n${performance}` : '') +
            (feedback ? `\nAjuste de calidad (OBEDECELO al regenerar): ${feedback}` : '') +
            (voice ? `\n${voice}` : '') +
            (Array.isArray(styleRules) && styleRules.length ? `\nReglas de estilo del cliente (OBEDECELAS siempre):\n${styleRules.map(r => `- ${r}`).join('\n')}` : '') +
            `\nGenerá el caption y los hashtags, diferenciando el contenido de la competencia.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const sub = String(parsed.suboverlay || '').trim();
  return {
    caption: parsed.caption || '',
    overlay: parsed.overlay || '',
    suboverlay: looksLikeBrief(sub) ? '' : sub.slice(0, 140),
    hashtags: parsed.hashtags || '',
  };
}

async function generateContent(input, apiKey) {
  if (apiKey) {
    try {
      const out = await openaiGenerate(input, apiKey);
      const check = captionPasses(out.caption);
      if (!check.ok) {
        // Puerta de calidad: UN solo reintento con feedback de qué falló. Nunca loopear.
        const fb = `El caption anterior no pasó el control de calidad: ${check.reason}. Regeneralo corrigiendo eso, sin cambiar el tema.`;
        try {
          return await openaiGenerate({ ...input, feedback: fb }, apiKey);
        } catch (e2) {
          console.error('Reintento de calidad falló, va el original:', e2.message);
        }
      }
      return out;
    } catch (e) {
      console.error('OpenAI falló, usando plantillas:', e.message);
    }
  }
  return templateGenerate(input);
}

// ---------- Creador v2: N captions distintos + hashtags ----------
async function openaiCaptions({ business, category, description, dna, tone, topic, feedback, goal, taste, tipo, performance, styleRules, voice }, n, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ENERGY_SYSTEM(n) },
        {
          role: 'user',
          content:
            businessContext({ business, category, description, dna, tone }) +
            `\nTema del post: ${topic}${goalLine(goal)}${tipoLine(tipo)}` +
            (feedback ? `\nAjuste que pide el usuario (OBEDECELO al regenerar): ${feedback}` : '') +
            (taste ? `\n${taste}` : '') +
            (performance ? `\nRendimiento real de tu cuenta:\n${performance}` : '') +
            (voice ? `\n${voice}` : '') +
            (Array.isArray(styleRules) && styleRules.length ? `\nReglas de estilo del cliente (OBEDECELAS siempre):\n${styleRules.map(r => `- ${r}`).join('\n')}` : '') +
            `\nGenerá los ${n} captions y los hashtags.`,
        },
      ],
      max_tokens: 1600,
      temperature: 0.95,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const caps = Array.isArray(parsed.captions) ? parsed.captions.map(String).filter(Boolean) : [];
  if (!caps.length) throw new Error('Sin captions');
  while (caps.length < n) caps.push(caps[caps.length % Math.max(caps.length, 1)]);
  const ovs = Array.isArray(parsed.overlays) ? parsed.overlays.map(String).filter(Boolean) : [];
  return { captions: caps.slice(0, n), overlays: ovs.slice(0, n), hashtags: String(parsed.hashtags || '') };
}

async function generateCaptions(input, n, apiKey) {
  if (apiKey) {
    try {
      const out = await openaiCaptions(input, n, apiKey);
      // Puerta de calidad por caption: los que fallen se regeneran individualmente (1 intento c/u).
      const fixedCaps = [];
      const fixedOvs = [];
      for (let i = 0; i < out.captions.length; i++) {
        const cap = out.captions[i];
        const check = captionPasses(cap);
        if (check.ok) {
          fixedCaps.push(cap);
          fixedOvs.push(out.overlays[i] || '');
          continue;
        }
        try {
          const one = await generateContent({
            ...input,
            topic: `${input.topic} (variante ${i + 1})`,
            feedback: `El caption anterior no pasó el control de calidad: ${check.reason}. Regeneralo corrigiendo eso, sin cambiar el tema.`,
          }, apiKey);
          fixedCaps.push(one.caption);
          fixedOvs.push(one.overlay || '');
        } catch (e) {
          console.error('Regeneración individual falló, va el original:', e.message);
          fixedCaps.push(cap);
          fixedOvs.push(out.overlays[i] || '');
        }
      }
      return { captions: fixedCaps, overlays: fixedOvs, hashtags: out.hashtags };
    } catch (e) {
      console.error('OpenAI captions falló, usando plantillas:', e.message);
    }
  }
  const seedBase = input.seedBase || 0;
  const captions = [];
  const overlays = [];
  const ovFb = String(input.topic || '').split(' ').slice(0, 5).join(' ').toUpperCase() || 'NOVEDAD';
  for (let i = 0; i < n; i++) { captions.push(templateCaption({ ...input, seed: seedBase + i })); overlays.push(ovFb); }
  const tags = [...(HASHTAGS[input.category] || HASHTAGS.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return { captions, overlays, hashtags: tags.join(' ') };
}

// ---------- Motor de ideas: nosotros pensamos el contenido por el cliente ----------
const CAT_WORDS = {
  ropa: { cosa: 'prendas', accion: 'vestirte' },
  moda: { cosa: 'prendas', accion: 'vestirte' },
  gastronomia: { cosa: 'platos', accion: 'comer rico' },
  cafeteria: { cosa: 'meriendas', accion: 'merendar' },
  bar: { cosa: 'noches', accion: 'salir' },
  belleza: { cosa: 'tratamientos', accion: 'verte bien' },
  barberia: { cosa: 'cortes', accion: 'mantener tu estilo' },
  fitness: { cosa: 'entrenamientos', accion: 'entrenar' },
  mascotas: { cosa: 'productos', accion: 'cuidar a tu mascota' },
  salud: { cosa: 'sonrisas', accion: 'cuidarte' },
  hogar: { cosa: 'arreglos', accion: 'mejorar tu casa' },
  deco: { cosa: 'espacios', accion: 'decorar tu casa' },
  inmobiliaria: { cosa: 'propiedades', accion: 'encontrar tu lugar' },
  autos: { cosa: 'autos', accion: 'cuidar tu auto' },
  educacion: { cosa: 'cursos', accion: 'aprender algo nuevo' },
  tecnologia: { cosa: 'equipos', accion: 'estar al día' },
  turismo: { cosa: 'escapadas', accion: 'viajar' },
  viajes: { cosa: 'destinos', accion: 'viajar' },
  eventos: { cosa: 'fiestas', accion: 'festejar' },
  fotografia: { cosa: 'fotos', accion: 'guardar tus momentos' },
  arte: { cosa: 'obras', accion: 'llenar tu casa de arte' },
  joyeria: { cosa: 'joyas', accion: 'brillar' },
  flores: { cosa: 'ramos', accion: 'regalar flores' },
  profesionales: { cosa: 'servicios', accion: 'resolverlo con un experto' },
  servicios: { cosa: 'servicios', accion: 'contratarte' },
  otro: { cosa: 'productos', accion: 'elegirte' },
};

// Palabras significativas (sin stopwords ni acentos) para detectar temas repetidos
const TOPIC_STOP = new Set('para con las los del una unos este esta estos estas como mas pero porque cuando donde tus sus mis son fue hay entre sobre todo todos muy sin tan'.split(' '));
function sigWords(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9#]+/).filter(w => w.length >= 4 && !TOPIC_STOP.has(w));
}

function templateIdeas({ business, category, competitors, goal, recentTopics, ephemeris }) {
  const w = CAT_WORDS[category] || CAT_WORDS.otro;
  const ga = GOAL_LINES[goal] ? ' ' + GOAL_LINES[goal].split('. ')[1] : '';
  const biz = business || 'tu negocio';
  const vs = competitors
    ? ` Diferenciate de ${competitors}: mostrá lo que ellos no tienen.`
    : '';
  const all = [
    { formato: 'Novedad', tipo: 'novedad', titulo: `lo nuevo de ${biz}`, angulo: `Presentá tu novedad como un lanzamiento que nadie se quiere perder.${vs}` + ga },
    { formato: 'Promo', tipo: 'promo', titulo: 'promo de la semana', angulo: 'Oferta con urgencia real: stock o tiempo limitado. La urgencia vende.' + ga },
    { formato: 'Tip', tipo: 'tip', titulo: `3 tips para ${w.accion} mejor`, angulo: 'Contenido que enseña: posiciona tu marca como experta y se guarda mucho.' + ga },
    { formato: 'Testimonio', tipo: 'social', titulo: 'lo que dicen nuestros clientes', angulo: 'Prueba social: la opinión de un cliente vale más que mil anuncios.' + ga },
    { formato: 'Detrás de escena', tipo: 'detras', titulo: `cómo preparamos ${w.cosa} cada día`, angulo: 'Humanizá la marca: mostrá el trabajo real detrás del producto.' + ga },
    { formato: 'Comunidad', tipo: 'social', titulo: 'te leemos: ¿qué preferís?', angulo: 'Preguntá y generá comentarios: la interacción dispara el alcance.' + ga },
    { formato: 'Reel/Video', tipo: 'novedad', titulo: `así se ve ${w.cosa} en acción`, angulo: 'Video vertical con tus fotos: el formato que más alcance tiene hoy en Instagram.' + ga },
  ];
  // Si un tema ya se posteó, se saca de la lista (2+ palabras significativas en común)
  if (recentTopics) {
    const rw = new Set(sigWords(recentTopics));
    const fresh = all.filter(id => sigWords(id.titulo).filter(x => rw.has(x)).length < 2);
    if (fresh.length >= 4) return withEphemeris(fresh);
  }
  return withEphemeris(all);
  // La efeméride va primera y marcada, también en el fallback sin IA
  function withEphemeris(list) {
    if (ephemeris && list.length) {
      const themed = { formato: 'Promo', tipo: 'promo', titulo: `${ephemeris.name}: promo especial`, angulo: `${ephemeris.angle}. Fecha que vende: no la dejes pasar.`, ephemeris: `${ephemeris.emoji} ${ephemeris.name}` };
      return [themed, ...list.slice(0, 6)];
    }
    return list;
  }
}

async function openaiIdeas({ business, category, description, dna, tone, competitors, taste, recentTopics, ephemeris, performance, learnings }, apiKey) {
  const ephLine = ephemeris
    ? `\n⚠️ EFEMÉRIDE CERCA: ${ephemeris.emoji} ${ephemeris.name} es el ${ephemeris.date} (en ${ephemeris.daysLeft} días). La idea N°1 TIENE que ser sobre eso (enfoque: ${ephemeris.angle}). Es una fecha que vende mucho: no la ignores.`
    : '';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Sos un estratega de marketing digital argentino experto en Instagram. Escribís en español rioplatense con voseo. Respondé SOLO con un JSON: {"ideas": [{"titulo": "...", "formato": "...", "tipo": "...", "angulo": "...", "porque": "..."}]}. Generá exactamente 7 ideas de posts variadas: novedad, promo, tip educativo, testimonio, detrás de escena, comunidad y reel/video. "titulo" es el tema en una frase corta. "formato" es una de esas 7 categorías (para video usá exactamente "Reel/Video"). "tipo" es el tipo de contenido: uno de promo, tip, social, detras, novedad (promo=oferta con urgencia, tip=educativo, social=prueba social o comunidad, detras=detrás de escena humano, novedad=anuncio o lanzamiento). REGLA DURA: nunca dos ideas seguidas con el mismo tipo — alterná los tipos a lo largo de la semana. "angulo" es el enfoque estratégico en 1-2 frases, explicando por qué va a rendir y cómo diferenciarse de la competencia. REGLA DE CONCRECIÓN: cada idea TIENE que estar atada a algo concreto del contexto del negocio (un producto, un servicio, una promo activa, una pregunta frecuente o un tema que rinde en su Instagram) — PROHIBIDO ideas genéricas que servirían para cualquier negocio (motivación genérica, "emprendé tus sueños", tips sin producto). "porque" es UNA línea de estrategia en voseo que explica por qué este posteo vende para ESTE negocio, atada a un producto/servicio/promo REAL del contexto (ej: "porque el 2x1 de esta semana es tu gancho de precio y este reel lo muestra puesto, que es lo que más te rinde"). El "porque" además sugiere el ángulo visual: qué debería mostrarse en la imagen (producto, escena, persona, detalle) para guiar al diseñador.',
        },
        {
          role: 'user',
          content: businessContext({ business, category, description, dna, tone, learnings }) +
            `\nCompetidores a superar: ${competitors || 'no indicados'}${taste || ''}${recentTopics ? `\nTemas ya publicados recientemente (NO los repitas ni con otra vuelta: proponé ideas nuevas): ${recentTopics}` : ''}${ephLine}${performance ? `\nRendimiento real de tu cuenta:\n${performance}` : ''}\nGenerá las 6 ideas.`,
        },
      ],
      max_tokens: 1200,
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 7) : [];
  if (!ideas.length) throw new Error('Sin ideas');
  const mapped = ideas.map((i, idx) => ({
    titulo: String(i.titulo || '').slice(0, 120),
    formato: String(i.formato || 'Contenido').slice(0, 30),
    tipo: TIPOS.includes(String(i.tipo || '').toLowerCase()) ? String(i.tipo).toLowerCase() : TIPOS[idx % TIPOS.length],
    angulo: String(i.angulo || '').slice(0, 280),
    porque: String(i.porque || '').slice(0, 200),
  }));
  // La primera idea es la de la efeméride: se marca para mostrarla destacada
  if (ephemeris && mapped.length) {
    mapped[0].ephemeris = `${ephemeris.emoji} ${ephemeris.name}`;
    mapped[0].tipo = 'promo';
  }
  return mapped;
}

async function generateIdeas(input, apiKey) {
  let ideas = null;
  if (apiKey) {
    try {
      ideas = await openaiIdeas(input, apiKey);
    } catch (e) {
      console.error('OpenAI ideas falló, usando plantillas:', e.message);
    }
  }
  if (!ideas) ideas = templateIdeas(input);
  // Filtro anti-invención: fuera ideas con placeholders típicos ("XYZ", "[...]").
  ideas = ideas.filter(i => !hasPlaceholders(`${i.titulo || ''} ${i.angulo || ''}`));
  // Garantía de variedad: nunca dos ideas seguidas del mismo tipo.
  return fixTipos(ideas);
}

// ---------- Pilares de contenido del mes ----------
// La estrategia mensual que guía la semana: 3-4 temas/ángulos que más van a
// vender y fidelizar. Con fallback por plantillas si no hay API key.
function templatePillars({ business }) {
  const biz = business || 'tu negocio';
  return [
    { titulo: 'Ofertas que venden', enfoque: `Promos concretas de ${biz} con precio, urgencia y CTA directo por DM.` },
    { titulo: 'Tips de experto', enfoque: 'Contenido educativo del rubro: enseña algo útil, posiciona y se guarda.' },
    { titulo: 'Comunidad', enfoque: 'Clientes, testimonios y detrás de escena: el lado humano que fideliza.' },
    { titulo: 'Novedades', enfoque: 'Lanzamientos y lo nuevo, con expectativa y revelación.' },
  ];
}
async function generatePillars({ business, category, description, performance }, apiKey) {
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Sos un estratega de contenidos argentino experto en Instagram. Escribís en español rioplatense con voseo. Respondé SOLO con un JSON: {"pilares": [{"titulo": "...", "enfoque": "..."}]}.',
            },
            {
              role: 'user',
              content:
                `Negocio: ${business || 'no especificado'}\nRubro: ${category || 'no especificado'}\nDescripción: ${description || 'no indicada'}` +
                (performance ? `\nRendimiento real de la cuenta:\n${performance}` : '') +
                `\nGenerá 4 pilares de contenido para el mes: los 4 temas o ángulos que más van a vender y fidelizar este mes, distintos entre sí. "titulo" corto (máx 6 palabras), "enfoque" en 1 línea concreta y accionable.`,
            },
          ],
          max_tokens: 500,
          temperature: 0.8,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      const ps = Array.isArray(parsed.pilares) ? parsed.pilares : [];
      const mapped = ps
        .map(p => ({
          titulo: String(p.titulo || '').slice(0, 60).trim(),
          enfoque: String(p.enfoque || '').slice(0, 160).trim(),
        }))
        .filter(p => p.titulo && p.enfoque)
        .slice(0, 4);
      if (mapped.length >= 3) return mapped;
    } catch (e) {
      console.error('OpenAI pilares falló, usando plantillas:', e.message);
    }
  }
  return templatePillars({ business });
}

// ---------- Chat consultor de ideas ----------
// El cliente cuenta su idea, la IA opina con honestidad y la pulen juntos.
// Cuando la idea está cerrada y aprobada, la IA la devuelve en un bloque ```idea {...}```
// Modelo del chat consultor: el cerebro de la conversación con el cliente.
// gpt-4o (no mini): el chat es la cara del producto y necesita el modelo más capaz.
const CHAT_MODEL = 'gpt-4o';
async function openaiChatIdea({ messages, profile, taste, photos, library, drafts, performance, dna, needDna, igAnalysis, frustrated, styleRules, voice, note, tz }, apiKey) {
  const p = profile || {};
  const cleanPhotos = Array.isArray(photos) ? photos.filter(u => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 4) : [];
  const libPhotos = Array.isArray(library) ? library.filter(u => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 6) : [];
  const sys =
    `Sos el community manager de "${p.business_name || 'este negocio'}": su mano derecha para Instagram, como un amigo que labura con él todos los días. ` +
    'Hablás en español rioplatense con voseo, cálido y canchero, como por WhatsApp: mensajes cortos (máximo 4-5 líneas), nada de testamentos ni lenguaje corporativo. ' +
    'Nunca te presentes como IA ni expliques lo que podés hacer: ya se conocen, actuá en consecuencia. ' +
    'Si sabés su nombre o el del negocio, usalo de vez en cuando, como haría un amigo. ' +
    'Tu trabajo: el cliente te cuenta ideas para posteos y vos le das tu opinión HONESTA, como un amigo que quiere que venda. ' +
    'Si la idea es floja, genérica o no va a vender, decilo con buena onda pero sin vueltas, y proponé ' +
    'concretamente cómo mejorarla (ángulo, hook, formato). Si es buena, decilo y pulila igual: ' +
    'siempre se puede vender más. Hacé preguntas cortas cuando te falte contexto (producto, objetivo). ' +
    'Nunca seas chupamedias: tu valor es decir la posta, como un amigo, no lo que el cliente quiere escuchar. ' +
    'REGLA CRÍTICA: jamás inventes productos, precios, promociones ni datos del negocio que no te dieron: si no sabés qué vende, preguntá o hablá en general, nunca inventes. ' +
    'MODO PEDIDO: muchos clientes no quieren brainstormear, quieren PEDIRTE un posteo concreto ' +
    '("necesito un posteo de la promo 2x1", "quiero vender mis buzos nuevos", "haceme algo que diga X"). ' +
    'Cuando detectes un pedido: NO interrogues ni devuelvas preguntas, armá la idea directo con lo que te ' +
    'dieron y cerrala con el bloque. Si te dictan el texto ("que diga: ..."), copialo TAL CUAL en el campo ' +
    'caption: jamás reescribas sus palabras con tu estilo. Si nombran una foto ("la del asado", "la segunda"), ' +
    'identificá su índice en las fotos guardadas que te muestro (0 = la más nueva) y ponelo en photo_index. ' +
    'Si piden colores ("en rojo", "con azul"), normalizalos a hex en colors (máximo 3). ' +
    'Cuando cierres la idea de un pedido, tu mensaje visible confirma en 1-2 líneas con onda qué entendiste ' +
    '(qué se vende, texto, foto, colores) y nada más. ' +
    (cleanPhotos.length
      ? 'El cliente adjuntó fotos de sus productos: MIRALAS con atención y opiná sobre lo que ves en ellas (qué producto conviene mostrar, calidad de la foto, qué ángulo vendería más). Referite a lo concreto que ves, nada de comentarios genéricos. '
      : '') +
    (libPhotos.length
      ? `El cliente tiene ${libPhotos.length} fotos guardadas: son las PRIMERAS ${libPhotos.length} imágenes que ves, en orden (índice 0 = la más nueva). Las que vienen después son las que adjuntó recién en este chat. Si te pide usar una guardada ("la del asado", "la segunda"), elegí el índice correcto mirándolas. `
      : '') +
    ((cleanPhotos.length || libPhotos.length)
      ? 'Como director de fotografía: opiná brevemente sobre la calidad de cada foto que ves (luz, foco, encuadre) y recomendá cuál conviene usar como protagonista y por qué. Si alguna está oscura o borrosa, decilo sin vueltas. '
      : '') +
    'Cuando la idea esté concreta y el cliente la apruebe (o te pida hacerla), cerrá tu mensaje con un bloque ' +
    'exacto así:\n```idea\n{"titulo": "título corto del post", "angulo": "ángulo en 1-2 líneas", "caption": "texto dictado por el cliente o null", "photo_index": 2, "colors": ["#D63A2F"]}\n```\n' +
    'caption va null salvo que el cliente te haya dictado el texto. photo_index y colors van null si no los pidió. ' +
    'Solo incluí ese bloque cuando la idea esté cerrada y aprobada. Nunca lo incluyas antes.' +
    'Si un mensaje del cliente no te cierra, preguntá corto en voseo qué quiso decir. ' +
    'PROHIBIDO responder "no puedo ayudarte con eso" o cualquier rechazo genérico: siempre hay algo útil para hacer o proponer.';
  // Borradores que el cliente está mirando AHORA: puede pedirte cambios sobre ellos.
  const draftList = (Array.isArray(drafts) ? drafts : [])
    .map((d, i) => `${i + 1}. [${d.when || 'sin fecha'}] "${String(d.caption || '').slice(0, 160)}"`)
    .join('\n');
  const draftsGuide = draftList
    ? 'Borradores que el cliente está revisando AHORA MISMO (los ve en pantalla):\n' + draftList + '\n' +
      'Si te pide cambiar algo de un borrador ("el segundo", "el de la promo", "cambiale el texto al primero", "sacale los emojis al último"): ' +
      'identificá cuál es por su número o por el tema, y aplicá el cambio DIRECTO con este bloque al final de tu mensaje:\n' +
      '```edit\n{"draft": 2, "caption": "texto nuevo completo", "hashtags": "#tags nuevos"}\n```\n' +
      'El número es el de la lista de arriba (1 = primero). Incluí solo los campos que cambian. ' +
      'Si te pide cambiar VARIOS a la vez ("a todos sacales los emojis", "los tres más cancheros"): emití VARIOS bloques ```edit seguidos, uno por borrador. ' +
      'Para REPROGRAMAR ("el segundo pasalo para mañana a las 18", "el viernes a la mañana el tercero"): agregá "when" con formato exacto "AAAA-MM-DD HH:MM" en hora local del cliente ' +
      '(usá la fecha actual del contexto para calcular el día; si dice "a la mañana" usá 10:00, "al mediodía" 13:00, "a la tarde" 17:00, "a la noche" 20:00). ' +
      'Confirmá siempre el día y la hora en tu mensaje ("listo, el segundo sale mañana miércoles a las 18"). ' +
      'Si te pide cambiar la FOTO ("poné la del local", "usá otra foto", "la del producto"): mirá sus fotos guardadas ' +
      '(las PRIMERAS imágenes que ves, índice 0 = la más nueva) y elegí la que mejor calce con lo que pide, ' +
      'devolviendo su índice en el bloque: ```edit\\n{\"draft\": 2, \"photo_index\": 3}\\n``` ' +
      'Solo cambiá la foto si te lo piden explícito o si la actual no tiene nada que ver con el tema. ' +
      'Si te pide una foto que no ves entre sus guardadas, NO adivines: decilo en 1 línea con onda y pedile que la suba. ' +
      'El cambio se aplica solo al borrador, sin más pasos ni preguntas. Después del bloque, confirmá en 1 línea con onda qué cambiaste. ' +
      'Si no entendés a cuál se refiere, preguntá corto ("¿el primero o el segundo?") en vez de adivinar.'
    : '';
  // ADN del negocio: entrevista breve si falta, contexto si ya está.
  const dnaGuide = (needDna && !dna)
    ? 'El cliente aún no tiene su ADN cargado. Conducí una entrevista breve y cálida, UNA pregunta por mensaje: ' +
      '1) ¿cuál es tu producto o servicio estrella? 2) ¿quién es tu cliente ideal? 3) ¿qué te diferencia de la competencia? 4) ¿cómo querés sonar? ' +
      'Si el cliente quiere otra cosa (un posteo), atendelo primero y retomá la entrevista después con naturalidad. ' +
      'Cuando tengas las 4 respuestas, cerrá con el bloque exacto:\n```dna\n{"producto_estrella": "...", "cliente_ideal": "...", "diferencial": "...", "tono": "..."}\n```'
    : '';
  // Modo frustración: el cliente ya probó varias variantes o lo dijo.
  const frustGuide = frustrated
    ? 'El cliente está frustrado (ya probó varias variantes o lo dijo). Dejá de proponer variantes. ' +
      'Preguntá directo y corto qué no le funciona: ¿el texto? ¿la foto? ¿el tono? UNA pregunta, nada más. Nada de optimismo vacío.'
    : '';
  // Opciones tocables para aclaraciones.
  const optionsGuide =
    'Cuando necesites una aclaración para avanzar, hacé UNA pregunta corta y ofrecé 2-3 opciones tocables con el bloque:\n' +
    '```options\n["Opción 1","Opción 2"]\n```\n' +
    'Las opciones van DESPUÉS de tu pregunta, no reemplazan tu mensaje.';
  // Reglas permanentes dictadas por el cliente.
  const ruleGuide =
    'Si el cliente te dicta una regla permanente ("siempre sin emojis", "nunca mayúsculas", "hablá de precios"), ' +
    'confirmala en 1 línea y cerrá con el bloque:\n```rule\n{"add": "siempre sin emojis"}\n```\n' +
    'Si te pide sacar una regla, usa {"remove": "..."}.';
  // Guion de reel segundo por segundo.
  const scriptGuide =
    'Si la idea es un REEL, incluí el guion segundo por segundo en el bloque idea:\n' +
    '```idea\n{"titulo": "...", "angulo": "...", "script": [{"seg": "0-3s", "visual": "qué se ve", "texto": "qué se dice/muestra"}, {"seg": "3-6s", "visual": "...", "texto": "..."}]}\n```\n' +
    'El hook va en los primeros 3 segundos (visual + texto que frene el scroll). 3 a 5 escenas.';
  // Moodboard: referencias de estilo que muestra el cliente.
  const inspoGuide =
    'Si el cliente te muestra posteos que le gustan como referencia de estilo ("me gusta este estilo", "quiero algo así"), ' +
    'analizá qué tienen en común (tono visual, tipografía, colores, ritmo del texto) y cerrá con:\n' +
    '```inspo\n{"estilo": "tu análisis en 2-3 líneas: qué tomar de esas referencias"}\n```';
  // Confirmación pelada ("dale", "sí", "ok", "de una"): el cliente aprobó tu última propuesta.
  // Se maneja con instrucción explícita porque es el momento donde el modelo más se equivoca:
  // confirmar es AVANZAR (cerrar con ```idea), nunca preguntar ni rechazar.
  const lastUserMsg = (messages[messages.length - 1] || {}).text || '';
  const isConfirm = lastUserMsg.trim().length < 25 &&
    /^(dale|sí|si|sip|ok|okay|de una|hacelo|hacela|genial|perfecto|joya|buenísimo|buenisimo|listo|va|me gusta|me encanta)[.!…\s]*$/i.test(lastUserMsg.trim());
  const confirmGuide = isConfirm
    ? 'El cliente acaba de CONFIRMAR tu propuesta con un "dale"/"sí"/"ok": NO hagas preguntas, NO digas que no podés ayudar, cerrá la idea AHORA MISMO con el bloque ```idea. ' +
      'Si tu propuesta anterior no tenía todos los datos del bloque, cerrala igual con lo que tengas (título + ángulo como mínimo). Confirmar es avanzar, nunca frenar.'
    : '';
  const sysFull = sys + draftsGuide + dnaGuide + frustGuide + optionsGuide + ruleGuide + scriptGuide + inspoGuide + confirmGuide;
  // ADN ya cargado: solo los campos presentes.
  const dnaCtx = (() => {
    if (!dna || typeof dna !== 'object') return '';
    const parts = [];
    if (dna.producto_estrella) parts.push(`producto estrella: ${dna.producto_estrella}`);
    if (dna.cliente_ideal) parts.push(`cliente ideal: ${dna.cliente_ideal}`);
    if (dna.diferencial) parts.push(`diferencial: ${dna.diferencial}`);
    if (dna.tono) parts.push(`tono: ${dna.tono}`);
    return parts.length ? `ADN del negocio: ${parts.join('; ')}.\n` : '';
  })();
  const rulesCtx = (Array.isArray(styleRules) && styleRules.length)
    ? `Reglas de estilo del cliente (OBEDECELAS siempre):\n${styleRules.map(r => `- ${r}`).join('\n')}\n`
    : '';
  // Fecha y hora actual (hora local del cliente): para "mañana", "el viernes", "esta semana" y reprogramar.
  const nowLine = (() => {
    try {
      const z = tz || 'America/Argentina/Buenos_Aires';
      const fecha = new Intl.DateTimeFormat('es-AR', { timeZone: z, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
      const hora = new Intl.DateTimeFormat('es-AR', { timeZone: z, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
      return `Hoy es ${fecha}, ${hora} hs (hora local del cliente).\n`;
    } catch (e) { return ''; }
  })();
  const ctx =
    nowLine +
    `Negocio: ${p.business_name || 'no especificado'}\nRubro: ${p.category || 'no especificado'}\n` +
    `Tono: ${p.tone || 'canchero'}\nDescripción: ${p.description || 'no indicada'}\n` +
    `Competidores: ${p.competitors || 'no indicados'}\nObjetivo: ${p.goal || 'vender más'}\n` +
    dnaCtx +
    (taste ? `Lo que le gustó/no le gustó antes: ${taste}\n` : '') +
    (performance ? `Rendimiento real de tu cuenta:\n${performance}\n` : '') +
    (igAnalysis ? `Análisis de tu Instagram actual:\n${igAnalysis}\n` : '') +
    (voice ? `${voice}\n` : '') +
    rulesCtx +
    (note ? `\n${note}\n` : '') +
    'Charlemos la idea del cliente.';
  const omsgs = messages.map(m => ({ role: m.role, content: m.text }));
  // Orden: primero las fotos GUARDADAS (índices 0..N-1, 0 = la más nueva), después las adjuntadas en el chat.
  const visionImgs = [
    ...libPhotos.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'low' } })),
    ...cleanPhotos.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'low' } })),
  ];
  if (visionImgs.length) {
    for (let i = omsgs.length - 1; i >= 0; i--) {
      if (omsgs[i].role === 'user') {
        omsgs[i] = {
          role: 'user',
          content: [
            { type: 'text', text: omsgs[i].content },
            ...visionImgs,
          ],
        };
        break;
      }
    }
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': ['Bearer', apiKey].join(' '),
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: sysFull },
        { role: 'user', content: ctx },
        ...omsgs,
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error('OpenAI chat: ' + res.status);
  const data = await res.json();
  return data.choices[0].message.content || '';
}

function templateChatIdea({ messages, profile }) {
  // Sin IA real: igual tiene que ser útil. Detecta la intención, propone
  // soluciones concretas (no un loop de preguntas) y CIERRA la idea.
  const p = profile || {};
  const biz = p.business_name || 'tu negocio';
  const userMsgs = messages.filter(m => m.role === 'user').map(m => String(m.text || ''));
  const last = (userMsgs[userMsgs.length - 1] || '').trim();
  const all = userMsgs.join(' ').toLowerCase();
  const turn = userMsgs.length;
  const first = (userMsgs[0] || '').trim();
  const echo = last.length > 90 ? cortar(last, 90) + '…' : last;
  const has = (...ws) => ws.some(w => all.includes(w));
  const yes = /^(dale|hacelo|hacela|hace|si\b|sí|sip|ok|okay|genial|perfecto|me gusta\b|me encanta\b|va\b|de una)/i.test(last);
  const topicShort = ((yes && first ? first : last).split(' ').slice(0, 6).join(' ').trim() || `Novedades de ${biz}`).slice(0, 80);

  let intent = 'general';
  if (has('sorteo', 'regal', 'ganar', 'concurso')) intent = 'sorteo';
  else if (has('nuevo', 'nueva', 'lanzamiento', 'lleg', 'ingres')) intent = 'lanzamiento';
  else if (has('vend', 'comprar', 'promo', 'descuento', 'oferta', 'precio', 'liquid')) intent = 'ventas';
  else if (has('visibilidad', 'visible', 'seguidores', 'crecer', 'alcance', 'mostrar', 'creativ')) intent = 'visibilidad';

  const ideaBlock = (titulo, angulo) =>
    `\n\`\`\`idea\n${JSON.stringify({ titulo, angulo })}\n\`\`\``;

  // ---- Cierres por intención: la idea queda lista para hacer el post ----
  const closers = {
    visibilidad: () => ({
      titulo: `Lo mejor de ${biz} esta semana`,
      angulo: 'Carrusel con lo más posteado/mostrado de la semana, cada ítem con su detalle. Cierra con la pregunta "¿cuál te llevarías?" para generar comentarios.',
      pitch: `Listo, la tenemos. Con tu objetivo (más visibilidad + mostrar variedad), el formato que más rinde es el carrusel de "lo mejor de la semana": mostrás el catálogo, la pregunta final genera comentarios y eso es lo que Instagram premia con alcance.`,
    }),
    ventas: () => ({
      titulo: topicShort,
      angulo: 'Foto del producto como héroe, beneficio principal en el diseño y CTA directo: "Escribinos por DM y te lo reservamos 📩".',
      pitch: `Vamos a lo que importa: vender. La fórmula que más convierte es producto héroe + un beneficio claro + CTA directo por DM. Sin vueltas, sin humo.`,
    }),
    lanzamiento: () => ({
      titulo: `Llegó lo nuevo a ${biz}`,
      angulo: 'Anuncio del lanzamiento con el producto como protagonista y fecha clara. Ideal como reel de 3 escenas: adelanto, revelación y CTA.',
      pitch: `Los lanzamientos rinden con anuncio directo y el producto como héroe. Lo haría reel: adelanto, revelación y CTA — el formato con más alcance para novedades.`,
    }),
    sorteo: () => ({
      titulo: `Sorteo en ${biz} 🎁`,
      angulo: 'Diseño con el premio bien grande y mecánica simple: seguinos + etiquetá a 2 amigos. Fecha del sorteo clara en el texto.',
      pitch: `Los sorteos explotan si el premio se ve increíble y participar es fácil. Mecánica simple, premio protagonista y fecha clara: eso trae seguidores de verdad.`,
    }),
    general: () => ({
      titulo: topicShort,
      angulo: 'Posteo directo con hook que frene el scroll, el contenido bien claro y un CTA según el objetivo (DM, comentario o guardado).',
      pitch: `Perfecto, con lo que me contaste ya la puedo armar. Voy por un posteo directo: hook que frene el scroll, contenido claro y CTA según tu objetivo.`,
    }),
  };

  // Turno 1: opinar + proponer caminos concretos + UNA pregunta
  if (turn <= 1 && !yes) {
    const openers = {
      visibilidad: `Me gusta la dirección. Para visibilidad lo que manda es el contenido que se guarda y se comparte — es lo que Instagram empuja. Con "${echo}", iría por: 1) 🏆 carrusel "lo mejor de la semana", 2) 🤔 "¿cuál te llevarías?" con opciones para juntar comentarios, 3) 📱 mostrar el producto en uso real.\n¿Cuál te cierra más?`,
      ventas: `Vamos a lo importante: vender. Con "${echo}", el ángulo que más convierte es prueba + CTA directo: el producto en uso o un testimonio, y "escribinos por DM y te lo reservamos 📩".\n¿Qué producto querés mover primero?`,
      lanzamiento: `Los lanzamientos rinden con antesala: 1) 👀 adelanto misterioso, 2) 🎬 el anuncio con el producto como héroe, 3) 💬 las primeras reacciones.\n¿Ya tenés fecha o lo lanzamos esta semana?`,
      sorteo: `Los sorteos traen seguidores de verdad si el premio se ve increíble y participar es fácil: seguinos + etiquetá a 2 amigos.\n¿Qué sorteamos y cuándo lo anunciamos?`,
      general: `Anotada: "${echo}". Mi opinión honesta: la idea funciona si el ángulo es concreto — lo genérico no frena el scroll.\n¿El objetivo es vender, ganar visibilidad o anunciar algo nuevo?`,
    };
    return openers[intent];
  }

  // Turno 2+ o "dale": cerrar la idea para que se pueda hacer el post
  const c = closers[intent]();
  return `${c.pitch}\n\nTe la dejé lista acá abajo 👇 Tocá "Hacerlo post" o "Hacerlo reel" y la revisás antes de programar.` +
    ideaBlock(c.titulo, c.angulo);
}

// Parsea el JSON del bloque ```idea. Devuelve el objeto idea o null (válido pero sin título).
// Lanza si el JSON está roto (el llamador decide si intenta reparar).
function parseIdeaJson(raw) {
  const j = JSON.parse(raw);
  if (!j || !j.titulo) return null;
  const idea = { titulo: String(j.titulo).slice(0, 120), angulo: String(j.angulo || '').slice(0, 280) };
  if (typeof j.caption === 'string' && j.caption.trim()) idea.caption = cortar(j.caption.trim(), 900);
  if (Number.isInteger(j.photo_index) && j.photo_index >= 0 && j.photo_index < 8) idea.photo_index = j.photo_index;
  if (Array.isArray(j.colors)) {
    const hexes = j.colors.map(c => String(c).trim())
      .filter(c => /^#?[0-9a-fA-F]{6}$/.test(c)).slice(0, 3)
      .map(c => (c.startsWith('#') ? c : '#' + c).toUpperCase());
    if (hexes.length) idea.colors = hexes;
  }
  // Guion de reel segundo por segundo (```idea con "script")
  if (Array.isArray(j.script)) {
    const scenes = j.script.slice(0, 6).map(s => {
      if (!s || typeof s !== 'object') return null;
      const seg = String(s.seg || '').slice(0, 12).trim();
      const visual = String(s.visual || '').slice(0, 200).trim();
      const texto = String(s.texto || '').slice(0, 200).trim();
      if (!seg && !visual && !texto) return null;
      return { seg, visual, texto };
    }).filter(Boolean);
    if (scenes.length) idea.script = scenes;
  }
  return idea;
}

// El modelo emitió el bloque ```idea con JSON roto: un único reintento pidiendo solo el JSON.
// Si también falla, lanza (la idea no se pierde en silencio: el bloque queda visible en el texto).
async function repairIdeaJson(brokenRaw, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: 'Devolvé ÚNICAMENTE el JSON corregido dentro de un bloque ```idea, sin ningún otro texto. El JSON debe tener "titulo" (string) y "angulo" (string); opcionalmente "caption", "photo_index", "colors" y "script".' },
        { role: 'user', content: 'Corregí este JSON para que sea válido:\n' + String(brokenRaw || '').slice(0, 2000) },
      ],
      max_tokens: 600,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('repair: ' + res.status);
  const data = await res.json();
  const out = String((data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '');
  const mm = out.match(/```idea\s*([\s\S]*?)```/) || out.match(/(\{[\s\S]*\})/);
  if (!mm) throw new Error('repair sin JSON');
  const idea = parseIdeaJson(mm[1]);
  if (!idea) throw new Error('repair sin título');
  return idea;
}

async function chatIdea({ messages, profile, taste, photos, library, drafts, performance, dna, needDna, igAnalysis, frustrated, styleRules, voice, note, tz }, apiKey) {
  let text;
  if (apiKey) {
    try {
      text = await openaiChatIdea({ messages, profile, taste, photos, library, drafts, performance, dna, needDna, igAnalysis, frustrated, styleRules, voice, note, tz }, apiKey);
    } catch (e) {
      console.error('OpenAI chat falló, usando plantilla:', e.message);
      console.log('[chat] motor: plantilla (fallback por error)');
      text = templateChatIdea({ messages, profile });
    }
  } else {
    console.log('[chat] motor: plantilla (sin API key)');
    text = templateChatIdea({ messages, profile });
  }
  // Extrae la propuesta cerrada si la IA la incluyó (incluye los campos del MODO PEDIDO).
  // Si el bloque existe pero el JSON está roto, un intento de reparación: la idea confirmada
  // por el cliente jamás se pierde en silencio por un error de formato.
  let idea = null;
  const m = String(text).match(/```idea\s*([\s\S]*?)```/);
  if (m) {
    let parsed = false;
    try { idea = parseIdeaJson(m[1]); parsed = true; } catch (e) {}
    if (!parsed && apiKey) {
      try { idea = await repairIdeaJson(m[1], apiKey); parsed = true; } catch (e) {}
    }
    if (parsed) text = String(text).replace(m[0], '').trim();
  }
  // Extrae los pedidos de edición directa sobre borradores (```edit).
  // Pueden ser VARIOS bloques (uno por borrador) cuando el cliente pide cambiar varios a la vez.
  let edits = [];
  for (const me of String(text).matchAll(/```edit\s*([\s\S]*?)```/g)) {
    try {
      const j = JSON.parse(me[1]);
      if (j && Number.isInteger(j.draft) && j.draft >= 1) {
        const e = { draft: j.draft };
        if (typeof j.caption === 'string' && j.caption.trim()) e.caption = cortar(j.caption.trim(), 900);
        if (typeof j.hashtags === 'string' && j.hashtags.trim()) e.hashtags = cortar(j.hashtags.trim(), 300);
        if (Number.isInteger(j.photo_index) && j.photo_index >= 0) e.photo_index = j.photo_index;
        if (typeof j.when === 'string' && j.when.trim()) e.when = j.when.trim().slice(0, 32);
        edits.push(e);
      }
    } catch (e) { /* bloque inválido: se ignora */ }
    text = String(text).replace(me[0], '').trim();
  }
  // ADN del negocio (```dna)
  let dnaOut = null;
  const md = String(text).match(/```dna\s*([\s\S]*?)```/);
  if (md) {
    try {
      const j = JSON.parse(md[1]);
      if (j && typeof j === 'object') {
        dnaOut = {};
        for (const k of ['producto_estrella', 'cliente_ideal', 'diferencial', 'tono']) {
          if (typeof j[k] === 'string' && j[k].trim()) dnaOut[k] = j[k].trim().slice(0, 300);
        }
        if (!Object.keys(dnaOut).length) dnaOut = null;
      }
      text = String(text).replace(md[0], '').trim();
    } catch (e) { /* bloque inválido: se ignora */ }
  }
  // Opciones tocables (```options)
  let options = null;
  const mo = String(text).match(/```options\s*([\s\S]*?)```/);
  if (mo) {
    try {
      const j = JSON.parse(mo[1]);
      if (Array.isArray(j)) {
        options = j.map(s => String(s).trim()).filter(Boolean).slice(0, 3);
        if (!options.length) options = null;
      }
      text = String(text).replace(mo[0], '').trim();
    } catch (e) { /* bloque inválido: se ignora */ }
  }
  // Regla permanente (```rule)
  let rule = null;
  const mr = String(text).match(/```rule\s*([\s\S]*?)```/);
  if (mr) {
    try {
      const j = JSON.parse(mr[1]);
      if (j && typeof j === 'object') {
        if (typeof j.add === 'string' && j.add.trim()) rule = { add: j.add.trim().slice(0, 200) };
        else if (typeof j.remove === 'string' && j.remove.trim()) rule = { remove: j.remove.trim().slice(0, 200) };
      }
      text = String(text).replace(mr[0], '').trim();
    } catch (e) { /* bloque inválido: se ignora */ }
  }
  // Moodboard (```inspo)
  let inspo = null;
  const mi = String(text).match(/```inspo\s*([\s\S]*?)```/);
  if (mi) {
    try {
      const j = JSON.parse(mi[1]);
      if (j && typeof j.estilo === 'string' && j.estilo.trim()) inspo = j.estilo.trim().slice(0, 500);
      text = String(text).replace(mi[0], '').trim();
    } catch (e) { /* bloque inválido: se ignora */ }
  }
  return { reply: text, idea, edits, dna: dnaOut, options, rule, inspo };
}

// ---------- Respuesta sugerida a un comentario de Instagram ----------
// Tono del negocio, 1-2 líneas, rioplatense. Nunca promete lo que no existe.
async function suggestReply({ business, category, tone, username, commentText }, apiKey) {
  const fallback = '¡Gracias por escribirnos! 🙌';
  if (!apiKey) return fallback;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Sos el community manager de "${business || 'un negocio'}" (${category || 'rubro general'}). Respondé el comentario de Instagram de @${username || 'un seguidor'} con calidez argentina (voseo), en 1-2 líneas como mucho. Tono ${tone || 'canchero'}. Si pregunta precio/stock/horario y no lo sabés, invitalo a escribir por DM sin inventar datos. Respondé SOLO con la respuesta, sin comillas.` },
          { role: 'user', content: `Comentario: "${String(commentText || '').slice(0, 300)}"` },
        ],
        max_tokens: 120,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const t = String((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim().replace(/^["“”]+|["“”]+$/g, '');
    return t.slice(0, 300) || fallback;
  } catch (e) {
    console.error('[suggestReply]', e.message);
    return fallback;
  }
}

// ---------- Misión de fotos semanal ----------
// 3 fotos concretas que el dueño saca con el celular esta semana.
// La misión es específica (no "sacá fotos"): lo específico se hace, lo vago se pospone.
async function openaiMission({ business, category, description }, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Sos un director de contenido para Instagram. Escribís en español rioplatense con voseo. Respondé SOLO con un JSON: {"shots": ["...", "...", "..."]}.',
        },
        {
          role: 'user',
          content: `Negocio: ${business || 'no especificado'}\nRubro: ${category || 'no indicado'}\nDescripción: ${description || 'no indicada'}\nDame exactamente 3 fotos que el dueño puede sacar con su celular ESTA SEMANA para el Instagram del negocio. REGLAS DURAS: cada foto en MÁXIMO 90 caracteres totales (si te pasás, se corta); formato "qué fotografiar" + tip de 3-5 palabras; variadas: producto/servicio, persona trabajando, y detalle o detrás de escena. Nada de "equipo en reunión creativa" ni oficinas genéricas salvo que el negocio realmente sea eso. Si la descripción es pobre o dice "no indicada", no inventes: pedí fotos que CUALQUIER negocio puede sacar (su producto, el dueño trabajando, un detalle lindo). Tono: hablale al dueño con voseo, como un amigo.`,
        },
      ],
      max_tokens: 400,
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const shots = Array.isArray(parsed.shots) ? parsed.shots.slice(0, 3) : [];
  if (shots.length < 3) throw new Error('Sin misión');
  // Forzar el largo en el servidor: el modelo suele ignorar el límite de 90.
  return shots.map(s => cortar(String(s), 90));
}
function templateMission() {
  return [
    'Tu producto estrella con luz natural 📸 Tip: cerca de una ventana, sin flash.',
    'Vos o tu equipo en plena acción 🙌 Tip: que te la saque otro.',
    'El rincón de tu local que todos fotografían 🏠 Tip: el ángulo favorito.',
  ];
}
async function generatePhotoMission(input, apiKey) {
  if (apiKey) {
    try {
      return await openaiMission(input, apiKey);
    } catch (e) {
      console.error('OpenAI misión falló, usando plantilla:', e.message);
    }
  }
  return templateMission();
}

module.exports = { generateContent, generateIdeas, generateCaptions, chatIdea, generatePhotoMission, suggestReply, generatePillars, performanceBrief, bestHoursLine, voiceExamples, HASHTAGS, BANNED_PHRASES, captionPasses, TIPO_LINES, tipoLine, TIPOS, CONCEPT_FAMILIES };
