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
  otro: ['#emprendedoresargentinos', '#pymesargentina', '#argentina', '#negociosdigitales'],
};

const GENERIC_TAGS = ['#argentina', '#emprendedor', '#marketingdigital'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function templateGenerate({ business, category, tone, topic }) {
  const t = HOOKS[tone] ? tone : 'canchero';
  const hook = pick(HOOKS[t]);
  const cta = pick(CTAS[t]);
  const biz = business ? ` en ${business}` : '';
  const tags = [...(HASHTAGS[category] || HASHTAGS.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);

  const caption =
    `${hook}\n\n${topic}${biz}.\n\n${cta}`;

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
            'Sos un community manager argentino experto en Instagram. Escribís en español rioplatense con voseo, tono cercano y canchero pero no exagerado. Respondé SOLO con un JSON: {"caption": "...", "hashtags": "#tag1 #tag2 ..."}. El caption debe tener un hook inicial fuerte, el contenido, y un call to action. Máximo 8 hashtags relevantes para Argentina.',
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

// ---------- Motor de ideas: nosotros pensamos el contenido por el cliente ----------
const CAT_WORDS = {
  ropa: { cosa: 'prendas', tip: '3 looks con poco presupuesto' },
  gastronomia: { cosa: 'platos', tip: '3 tips para comer rico' },
  fitness: { cosa: 'entrenamientos', tip: '3 errores que frenan tu progreso' },
  servicios: { cosa: 'servicios', tip: '3 preguntas antes de contratar' },
  mascotas: { cosa: 'productos', tip: '3 cuidados que tu mascota necesita' },
  viajes: { cosa: 'destinos', tip: '3 destinos que valen la pena' },
  belleza: { cosa: 'tratamientos', tip: '3 hábitos para verte mejor' },
  otro: { cosa: 'productos', tip: '3 tips de experto' },
};

function templateIdeas({ business, category, competitors }) {
  const w = CAT_WORDS[category] || CAT_WORDS.otro;
  const biz = business || 'tu negocio';
  const vs = competitors
    ? ` Diferenciate de ${competitors}: mostrá lo que ellos no tienen.`
    : '';
  return [
    { formato: 'Novedad', titulo: `Lo nuevo de ${biz}`, angulo: `Presentá tu novedad como un lanzamiento que nadie se quiere perder.${vs}` },
    { formato: 'Promo', titulo: 'Promo de la semana', angulo: 'Oferta con urgencia real: stock o tiempo limitado. La urgencia vende.' },
    { formato: 'Tip', titulo: w.tip, angulo: 'Contenido que enseña: posiciona tu marca como experta y se guarda mucho.' },
    { formato: 'Testimonio', titulo: 'Lo que dicen nuestros clientes', angulo: 'Prueba social: la opinión de un cliente vale más que mil anuncios.' },
    { formato: 'Detrás de escena', titulo: `Cómo preparamos ${w.cosa} cada día`, angulo: 'Humanizá la marca: mostrá el trabajo real detrás del producto.' },
    { formato: 'Comunidad', titulo: 'Te leemos: ¿qué preferís?', angulo: 'Preguntá y generá comentarios: la interacción dispara el alcance.' },
    { formato: 'Reel/Video', titulo: `Así se ve ${w.cosa} en acción`, angulo: 'Video vertical con tus fotos: el formato que más alcance tiene hoy en Instagram.' },
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

module.exports = { generateContent, generateIdeas, HASHTAGS };
