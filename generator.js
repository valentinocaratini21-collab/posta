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

function stripEmojis(s) {
  return String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/ {2,}/g, ' ');
}

// Caption con energía a partir de plantillas. `seed` varía hook/CTA/beneficio;
// `feedback` permite ajustes ("más corto", "sin emojis", "más divertido"...).
function templateCaption({ business, category, tone, topic, feedback, seed }) {
  const fb = String(feedback || '');
  let t = /divert|gracios/i.test(fb) ? 'divertido' : (/profesion|seri[oa]|elegante/i.test(fb) ? 'profesional' : (HOOKS[tone] ? tone : 'canchero'));
  const hooks = [...(HOOKS[t] || HOOKS.canchero), ...(ENERGY_HOOKS[t] || [])];
  const ctas = [...(CTAS[t] || CTAS.canchero), ...(ENERGY_CTAS[t] || [])];
  const hook = hooks[seed % hooks.length];
  const cta = ctas[(seed * 3 + 1) % ctas.length];
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

function templateGenerate({ business, category, tone, topic }) {
  const t = HOOKS[tone] ? tone : 'canchero';
  const caption = templateCaption({ business, category, tone: t, topic, feedback: '', seed: Math.floor(Math.random() * 1000) });
  const tags = [...(HASHTAGS[category] || HASHTAGS.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return { caption, hashtags: tags.join(' ') };
}

async function openaiGenerate({ business, category, tone, topic, competitors }, apiKey) {
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
          content: `Negocio: ${business || 'no especificado'}\nRubro: ${category}\nTono: ${tone}\nTema del post: ${topic}\nCompetidores: ${competitors || 'no indicados'}\nGenerá el caption y los hashtags, diferenciando el contenido de la competencia.`,
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
async function openaiCaptions({ business, category, tone, topic, feedback }, n, apiKey) {
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
            `Negocio: ${business || 'no especificado'}\nRubro: ${category}\nTono: ${tone}\nTema del post: ${topic}` +
            (feedback ? `\nAjuste que pide el usuario (OBEDECELO al regenerar): ${feedback}` : '') +
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
  gastronomia: { cosa: 'platos', accion: 'comer rico' },
  fitness: { cosa: 'entrenamientos', accion: 'entrenar' },
  servicios: { cosa: 'servicios', accion: 'contratarte' },
  mascotas: { cosa: 'productos', accion: 'cuidar a tu mascota' },
  viajes: { cosa: 'destinos', accion: 'viajar' },
  belleza: { cosa: 'tratamientos', accion: 'verte bien' },
  otro: { cosa: 'productos', accion: 'elegirte' },
};

function templateIdeas({ business, category, competitors }) {
  const w = CAT_WORDS[category] || CAT_WORDS.otro;
  const biz = business || 'tu negocio';
  const vs = competitors
    ? ` Diferenciate de ${competitors}: mostrá lo que ellos no tienen.`
    : '';
  return [
    { formato: 'Novedad', titulo: `lo nuevo de ${biz}`, angulo: `Presentá tu novedad como un lanzamiento que nadie se quiere perder.${vs}` },
    { formato: 'Promo', titulo: 'promo de la semana', angulo: 'Oferta con urgencia real: stock o tiempo limitado. La urgencia vende.' },
    { formato: 'Tip', titulo: `3 tips para ${w.accion} mejor`, angulo: 'Contenido que enseña: posiciona tu marca como experta y se guarda mucho.' },
    { formato: 'Testimonio', titulo: 'lo que dicen nuestros clientes', angulo: 'Prueba social: la opinión de un cliente vale más que mil anuncios.' },
    { formato: 'Detrás de escena', titulo: `cómo preparamos ${w.cosa} cada día`, angulo: 'Humanizá la marca: mostrá el trabajo real detrás del producto.' },
    { formato: 'Comunidad', titulo: 'te leemos: ¿qué preferís?', angulo: 'Preguntá y generá comentarios: la interacción dispara el alcance.' },
    { formato: 'Reel/Video', titulo: `así se ve ${w.cosa} en acción`, angulo: 'Video vertical con tus fotos: el formato que más alcance tiene hoy en Instagram.' },
  ];
}

async function openaiIdeas({ business, category, tone, description, competitors }, apiKey) {
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
          content: `Negocio: ${business || 'no especificado'}\nRubro: ${category}\nTono: ${tone}\nDescripción: ${description || 'no indicada'}\nCompetidores a superar: ${competitors || 'no indicados'}\nGenerá las 6 ideas.`,
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

module.exports = { generateContent, generateIdeas, generateCaptions, HASHTAGS };
