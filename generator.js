// Generador de contenido — Posta
// Usa OpenAI si hay API key configurada, si no usa el motor de plantillas local
// con voz argentina (voseo).

const HOOKS = {
  canchero: [
    'Che, mirá esto 👀',
    'Esto te va a volar la cabeza 🔥',
    'Atención, que esto es posta 👇',
    'No lo vas a poder creer 🤯',
    'Mirá lo que tenemos para vos ✨',
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
    'Esto no es un post más 🔥',
    'Te lo digo de una: lo necesitás 💥',
    'Mirá esto y después me contás 🤩',
    'Si te gusta lo bueno, seguí leyendo 👀',
    'Alerta: esto vuela 🚨',
    'Lo que estabas esperando, llegó ✨',
    'No digas que no te avisamos ⚡',
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

const ENERGY_SYSTEM = (n) =>
  `Sos un community manager argentino experto en Instagram que vende de verdad. ` +
  `Escribís en español rioplatense con voseo, tono cercano, canchero y con ENERGÍA: ` +
  `nada de lenguaje corporativo ni frases de manual. Cada caption lleva: un hook inicial ` +
  `que frene el scroll (1 línea con punch), el contenido con onda y un call to action claro. ` +
  `Usá 1 o 2 emojis bien puestos, nunca más. ` +
  `Respondé SOLO con un JSON: {"captions": ["...", ...], "hashtags": "#tag1 #tag2 ..."}. ` +
  `Generá exactamente ${n} captions DISTINTOS entre sí. Máximo 8 hashtags relevantes para Argentina.`;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function templateGenerate({ business, category, tone, topic, goal }) {
  const t = HOOKS[tone] ? tone : 'canchero';
  const caption = templateCaption({ business, category, tone: t, topic, feedback: '', seed: Math.floor(Math.random() * 1000), goal });
  const tags = [...(HASHTAGS[category] || HASHTAGS.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return { caption, hashtags: tags.join(' ') };
}

async function openaiGenerate({ business, category, tone, topic, competitors, goal, taste }, apiKey) {
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
            'Sos un community manager argentino experto en Instagram que vende de verdad. ' +
            'Escribís en español rioplatense con voseo, tono cercano, canchero y con ENERGÍA: ' +
            'nada de lenguaje corporativo ni frases de manual. El caption lleva un hook inicial ' +
            'que frene el scroll (1 línea con punch), el contenido con onda y un call to action claro. ' +
            'Usá 1 o 2 emojis bien puestos, nunca más. ' +
            'Respondé SOLO con un JSON: {"caption": "...", "hashtags": "#tag1 #tag2 ..."}. Máximo 8 hashtags relevantes para Argentina.',
        },
        {
          role: 'user',
          content: `Negocio: ${business || 'no especificado'}\nRubro: ${category}\nTono: ${tone}\nTema del post: ${topic}\nCompetidores: ${competitors || 'no indicados'}${goalLine(goal)}${taste || ''}\nGenerá el caption y los hashtags, diferenciando el contenido de la competencia.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return {
    caption: parsed.caption || '',
    hashtags: parsed.hashtags || '',
  };
}

async function generateContent(input, apiKey) {
  if (apiKey) {
    try {
      return await openaiGenerate(input, apiKey);
    } catch (e) {
      console.error('OpenAI falló, usando plantillas:', e.message);
    }
  }
  return templateGenerate(input);
}

// ---------- Creador v2: N captions distintos + hashtags ----------
async function openaiCaptions({ business, category, tone, topic, feedback, goal, taste }, n, apiKey) {
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
            `Negocio: ${business || 'no especificado'}\nRubro: ${category}\nTono: ${tone}\nTema del post: ${topic}${goalLine(goal)}` +
            (feedback ? `\nAjuste que pide el usuario (OBEDECELO al regenerar): ${feedback}` : '') +
            (taste ? `\n${taste}` : '') +
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
  return { captions: caps.slice(0, n), hashtags: String(parsed.hashtags || '') };
}

async function generateCaptions(input, n, apiKey) {
  if (apiKey) {
    try {
      return await openaiCaptions(input, n, apiKey);
    } catch (e) {
      console.error('OpenAI captions falló, usando plantillas:', e.message);
    }
  }
  const seedBase = input.seedBase || 0;
  const captions = [];
  for (let i = 0; i < n; i++) captions.push(templateCaption({ ...input, seed: seedBase + i }));
  const tags = [...(HASHTAGS[input.category] || HASHTAGS.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return { captions, hashtags: tags.join(' ') };
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

function templateIdeas({ business, category, competitors, goal, recentTopics }) {
  const w = CAT_WORDS[category] || CAT_WORDS.otro;
  const ga = GOAL_LINES[goal] ? ' ' + GOAL_LINES[goal].split('. ')[1] : '';
  const biz = business || 'tu negocio';
  const vs = competitors
    ? ` Diferenciate de ${competitors}: mostrá lo que ellos no tienen.`
    : '';
  const all = [
    { formato: 'Novedad', titulo: `lo nuevo de ${biz}`, angulo: `Presentá tu novedad como un lanzamiento que nadie se quiere perder.${vs}` + ga },
    { formato: 'Promo', titulo: 'promo de la semana', angulo: 'Oferta con urgencia real: stock o tiempo limitado. La urgencia vende.' + ga },
    { formato: 'Tip', titulo: `3 tips para ${w.accion} mejor`, angulo: 'Contenido que enseña: posiciona tu marca como experta y se guarda mucho.' + ga },
    { formato: 'Testimonio', titulo: 'lo que dicen nuestros clientes', angulo: 'Prueba social: la opinión de un cliente vale más que mil anuncios.' + ga },
    { formato: 'Detrás de escena', titulo: `cómo preparamos ${w.cosa} cada día`, angulo: 'Humanizá la marca: mostrá el trabajo real detrás del producto.' + ga },
    { formato: 'Comunidad', titulo: 'te leemos: ¿qué preferís?', angulo: 'Preguntá y generá comentarios: la interacción dispara el alcance.' + ga },
    { formato: 'Reel/Video', titulo: `así se ve ${w.cosa} en acción`, angulo: 'Video vertical con tus fotos: el formato que más alcance tiene hoy en Instagram.' + ga },
  ];
  // Si un tema ya se posteó, se saca de la lista (2+ palabras significativas en común)
  if (recentTopics) {
    const rw = new Set(sigWords(recentTopics));
    const fresh = all.filter(id => sigWords(id.titulo).filter(x => rw.has(x)).length < 2);
    if (fresh.length >= 4) return fresh;
  }
  return all;
}

async function openaiIdeas({ business, category, tone, description, competitors, taste, recentTopics }, apiKey) {
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
            'Sos un estratega de marketing digital argentino experto en Instagram. Escribís en español rioplatense con voseo. Respondé SOLO con un JSON: {"ideas": [{"titulo": "...", "formato": "...", "angulo": "..."}]}. Generá exactamente 7 ideas de posts variadas: novedad, promo, tip educativo, testimonio, detrás de escena, comunidad y reel/video. "titulo" es el tema en una frase corta. "formato" es una de esas 7 categorías (para video usá exactamente "Reel/Video"). "angulo" es el enfoque estratégico en 1-2 frases, explicando por qué va a rendir y cómo diferenciarse de la competencia.',
        },
        {
          role: 'user',
          content: `Negocio: ${business || 'no especificado'}\nRubro: ${category}\nTono: ${tone}\nDescripción: ${description || 'no indicada'}\nCompetidores a superar: ${competitors || 'no indicados'}${taste || ''}${recentTopics ? `\nTemas ya publicados recientemente (NO los repitas ni con otra vuelta: proponé ideas nuevas): ${recentTopics}` : ''}\nGenerá las 6 ideas.`,
        },
      ],
      max_tokens: 900,
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, 7) : [];
  if (!ideas.length) throw new Error('Sin ideas');
  return ideas.map(i => ({
    titulo: String(i.titulo || '').slice(0, 120),
    formato: String(i.formato || 'Contenido').slice(0, 30),
    angulo: String(i.angulo || '').slice(0, 280),
  }));
}

async function generateIdeas(input, apiKey) {
  if (apiKey) {
    try {
      return await openaiIdeas(input, apiKey);
    } catch (e) {
      console.error('OpenAI ideas falló, usando plantillas:', e.message);
    }
  }
  return templateIdeas(input);
}

// ---------- Chat consultor de ideas ----------
// El cliente cuenta su idea, la IA opina con honestidad y la pulen juntos.
// Cuando la idea está cerrada y aprobada, la IA la devuelve en un bloque ```idea {...}```
async function openaiChatIdea({ messages, profile, taste, photos }, apiKey) {
  const p = profile || {};
  const cleanPhotos = Array.isArray(photos) ? photos.filter(u => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 4) : [];
  const sys =
    'Sos el consultor de contenido de Posta, un experto argentino en Instagram que vende de verdad. ' +
    'Hablás en español rioplatense con voseo, tono cercano y canchero, sin lenguaje corporativo. ' +
    'Tu trabajo: el cliente te cuenta ideas para posteos y vos le das tu opinión HONESTA. ' +
    'Si la idea es floja, genérica o no va a vender, decilo con buena onda pero sin vueltas, y proponé ' +
    'concretamente cómo mejorarla (ángulo, hook, formato). Si es buena, decilo y pulila igual: ' +
    'siempre se puede vender más. Hacé preguntas cortas cuando te falte contexto (producto, objetivo). ' +
    'Mensajes cortos, como un chat de verdad: máximo 4-5 líneas por respuesta, nada de testamentos. ' +
    'Nunca seas chupamedias: tu valor es decir la posta, no lo que el cliente quiere escuchar. ' +
    (cleanPhotos.length
      ? 'El cliente adjuntó fotos de sus productos: MIRALAS con atención y opiná sobre lo que ves en ellas (qué producto conviene mostrar, calidad de la foto, qué ángulo vendería más). Referite a lo concreto que ves, nada de comentarios genéricos. '
      : '') +
    'Cuando la idea esté concreta y el cliente la apruebe (o te pida hacerla), cerrá tu mensaje con un bloque ' +
    'exacto así:\n```idea\n{"titulo": "título corto del post", "angulo": "ángulo en 1-2 líneas"}\n```\n' +
    'Solo incluí ese bloque cuando la idea esté cerrada y aprobada. Nunca lo incluyas antes.';
  const ctx =
    `Negocio: ${p.business_name || 'no especificado'}\nRubro: ${p.category || 'no especificado'}\n` +
    `Tono: ${p.tone || 'canchero'}\nDescripción: ${p.description || 'no indicada'}\n` +
    `Competidores: ${p.competitors || 'no indicados'}\nObjetivo: ${p.goal || 'vender más'}\n` +
    (taste ? `Lo que le gustó/no le gustó antes: ${taste}\n` : '') +
    'Charlemos la idea del cliente.';
  const omsgs = messages.map(m => ({ role: m.role, content: m.text }));
  if (cleanPhotos.length) {
    for (let i = omsgs.length - 1; i >= 0; i--) {
      if (omsgs[i].role === 'user') {
        omsgs[i] = {
          role: 'user',
          content: [
            { type: 'text', text: omsgs[i].content },
            ...cleanPhotos.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'low' } })),
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
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: ctx },
        ...omsgs,
      ],
      max_tokens: 400,
      temperature: 0.9,
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
  const echo = last.length > 90 ? last.slice(0, 90).trim() + '…' : last;
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

async function chatIdea({ messages, profile, taste, photos }, apiKey) {
  let text;
  if (apiKey) {
    try {
      text = await openaiChatIdea({ messages, profile, taste, photos }, apiKey);
    } catch (e) {
      console.error('OpenAI chat falló, usando plantilla:', e.message);
      console.log('[chat] motor: plantilla (fallback por error)');
      text = templateChatIdea({ messages, profile });
    }
  } else {
    console.log('[chat] motor: plantilla (sin API key)');
    text = templateChatIdea({ messages, profile });
  }
  // Extrae la propuesta cerrada si la IA la incluyó
  let idea = null;
  const m = String(text).match(/```idea\s*([\s\S]*?)```/);
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      if (j && j.titulo) idea = { titulo: String(j.titulo).slice(0, 120), angulo: String(j.angulo || '').slice(0, 280) };
      text = String(text).replace(m[0], '').trim();
    } catch (e) { /* bloque inválido: se ignora */ }
  }
  return { reply: text, idea };
}

module.exports = { generateContent, generateIdeas, generateCaptions, chatIdea, HASHTAGS };
