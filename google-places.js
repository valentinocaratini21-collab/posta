// google-places.js — "Lo que dicen tus clientes"
// Busca el negocio en Google Places, lee las reseñas (hasta 5) y deja que GPT
// gpt-4o-mini extraiga puntos fuertes y testimonios LITERALES para el ADN.
// Esto SOLO lee y analiza: nunca publica nada.
//
// Sin process.env.GOOGLE_PLACES_KEY → nada rompe: el status lo indica y la
// tarjeta de Ajustes explica cómo conseguir la key.
//
// Exporta: { analyzeGooglePlaces, findPlace, getPlaceReviews }
'use strict';

const PLACES_TIMEOUT_MS = 15000; // 15s por llamada
const UA = 'Mozilla/5.0 (compatible; PostaBot/1.0; +https://postahacetodo.com)';
const KEY_HELP = 'Falta la clave de Google Places API. Creá una en console.cloud.google.com ' +
  '(activá la API "Places API" y generá una API key) y pedinos que la configuremos.';

function placesKey() {
  return String(process.env.GOOGLE_PLACES_KEY || '').trim();
}

async function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PLACES_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Text Search: "Nombre del negocio + ubicación" → { place_id, name, formatted_address } o null.
async function findPlace(query) {
  const key = placesKey();
  if (!key) throw new Error(KEY_HELP);
  const q = String(query || '').trim();
  if (!q) throw new Error('Pasame el nombre del negocio para buscarlo');
  const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json' +
    `?query=${encodeURIComponent(q)}&language=es&key=${encodeURIComponent(key)}`;
  let d;
  try { d = await fetchJson(url); }
  catch (e) { throw new Error('No pudimos llegar a Google Places, probá de nuevo en un rato'); }
  if (d.status === 'ZERO_RESULTS') return null;
  if (d.status === 'REQUEST_DENIED') throw new Error('Google rechazó la clave de Places API. Revisá que la API esté activada y la key sea válida.');
  if (d.status !== 'OK') throw new Error('Google no devolvió resultados, probá de nuevo en un rato');
  const first = (d.results || [])[0];
  if (!first || !first.place_id) return null;
  return { place_id: first.place_id, name: first.name || '', formatted_address: first.formatted_address || '', rating: first.rating || 0 };
}

// Place Details: reseñas (Google devuelve hasta 5) + rating.
async function getPlaceReviews(placeId) {
  const key = placesKey();
  if (!key) throw new Error(KEY_HELP);
  const url = 'https://maps.googleapis.com/maps/api/place/details/json' +
    `?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total,reviews&language=es&key=${encodeURIComponent(key)}`;
  let d;
  try { d = await fetchJson(url); }
  catch (e) { throw new Error('No pudimos leer las reseñas, probá de nuevo en un rato'); }
  if (d.status !== 'OK') throw new Error('No encontramos ese negocio en Google, probá con otro nombre');
  const r = d.result || {};
  return {
    place_name: r.name || '',
    rating: r.rating || 0,
    total_ratings: r.user_ratings_total || 0,
    reviews: (r.reviews || []).slice(0, 5).map(x => ({
      author: String(x.author_name || 'Un cliente').trim(),
      text: String(x.text || '').trim(),
      rating: x.rating || 0,
    })).filter(x => x.text),
  };
}

// ---------------------------------------------------------------------------
// GPT: extrae puntos fuertes + testimonios LITERALES de las reviews
// ---------------------------------------------------------------------------
async function structureWithGpt(reviews, placeName, apiKey) {
  const corpus = reviews
    .map((r, i) => `[${i + 1}] ${r.author} (${r.rating}/5): ${r.text}`)
    .join('\n\n')
    .slice(0, 9000);
  const system =
    'Sos un asistente que lee reseñas de Google de un negocio y extrae lo esencial. Respondé SOLO con un JSON.\n' +
    'REGLAS DURAS: PROHIBIDO INVENTAR, ADORNAR O PARAFRASEAR. Todo lo que devuelvas tiene que salir LITERALMENTE de las reseñas.\n' +
    '- "testimonios": 3 a 5 citas LITERALES, cortas (máx 120 caracteres cada una), copiadas TAL CUAL de una reseña. Nada de inventar nombres: el autor va con inicial del apellido si aparece (ej: "Martín G."). Si una cita está en primera persona la podés recortar pero sin cambiar ni una palabra. Si no hay 3 citas reales, devolvé menos; jamás completes con frases inventadas.\n' +
    '- "puntos_fuertes": lista corta (máx 6) de lo que los clientes REPITEN: atención, precios, calidad, velocidad, ambiente, etc. Una o dos palabras cada uno. Solo temas que aparezcan en al menos 2 reseñas.\n' +
    'Respondé SOLO con este JSON, sin texto extra:\n' +
    '{ "puntos_fuertes": ["..."], "testimonios": [{"cita": "...", "autor": "..."}] }';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Negocio: ${placeName}\n\nReseñas de Google:\n${corpus}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  let parsed = {};
  try { parsed = JSON.parse(data.choices[0].message.content || '{}'); } catch (e) { parsed = {}; }
  const pf = Array.isArray(parsed.puntos_fuertes)
    ? parsed.puntos_fuertes.map(x => String(x).slice(0, 60)).filter(Boolean).slice(0, 6)
    : [];
  const tt = Array.isArray(parsed.testimonios)
    ? parsed.testimonios
      .map(t => ({ cita: String((t && t.cita) || '').slice(0, 160).trim(), autor: String((t && t.autor) || '').slice(0, 40).trim() }))
      .filter(t => t.cita.length >= 8)
      .slice(0, 5)
    : [];
  return { puntos_fuertes: pf, testimonios: tt };
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------
// analyzeGooglePlaces({ query, openaiKey }) →
//   { place_id, place_name, rating, total_ratings, reviews_analyzed,
//     puntos_fuertes, testimonios, partial }
// Lanza Error con mensaje amable en cada paso.
async function analyzeGooglePlaces({ query, openaiKey }) {
  if (!placesKey()) throw new Error(KEY_HELP);

  const place = await findPlace(query);
  if (!place) throw new Error('No encontramos tu negocio en Google Maps. Probá escribir el nombre como aparece en tu ficha de Google.');

  const details = await getPlaceReviews(place.place_id);
  const placeName = details.place_name || place.name;

  let extracted = { puntos_fuertes: [], testimonios: [] };
  let partial = false;
  if (details.reviews.length > 0 && openaiKey) {
    extracted = await structureWithGpt(details.reviews, placeName, openaiKey);
  } else if (!details.reviews.length) {
    partial = true; // el negocio existe pero no tiene reseñas legibles todavía
  } else {
    partial = true; // sin OpenAI no podemos estructurar las reseñas
  }

  return {
    place_id: place.place_id,
    place_name: placeName,
    rating: details.rating,
    total_ratings: details.total_ratings,
    reviews_analyzed: details.reviews.length,
    puntos_fuertes: extracted.puntos_fuertes,
    testimonios: extracted.testimonios,
    partial,
  };
}

module.exports = { analyzeGooglePlaces, findPlace, getPlaceReviews };
