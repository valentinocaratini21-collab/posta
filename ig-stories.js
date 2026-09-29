// ig-stories.js — "Historias recientes de IG" (Track 5, Expertos en información)
// Lee las historias de las últimas 24h del cliente —todo lo que permite la
// Graph API oficial: NO existe endpoint de archivo de historias— y extrae el
// texto visible (promos, anuncios) con visión gpt-4o (detail: 'low').
// Solo se analizan historias con imagen; en videos se usa el thumbnail.
// Esto SOLO lee y analiza: nunca publica nada.
//
// Exporta: { fetchStories, analyzeStories, storiesDnaPatch }
'use strict';

const API_VERSION = 'v26.0';
const IG_HOST = 'https://graph.instagram.com';
const FETCH_TIMEOUT_MS = 20000;           // 20s por llamada a la Graph API
const IMAGE_TIMEOUT_MS = 25000;           // 25s por descarga de imagen
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;  // 8MB: historias más pesadas se saltean
const MAX_STORIES = 25;

// ---------------------------------------------------------------------------
// 1. Traer las historias de las últimas 24h
//    GET /{ig-user-id}/stories?fields=id,media_type,media_url,thumbnail_url,timestamp
// ---------------------------------------------------------------------------
async function fetchStories(igUserId, accessToken) {
  if (!igUserId || !accessToken) throw new Error('Faltan las credenciales de Instagram');
  const fields = 'id,media_type,media_url,thumbnail_url,timestamp';
  const url = `${IG_HOST}/${API_VERSION}/${igUserId}/stories?fields=${fields}&limit=${MAX_STORIES}&access_token=${accessToken}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      throw new Error('Instagram no nos dejó leer tus historias. Revisá que la cuenta siga conectada en Ajustes.');
    }
    throw new Error(`Instagram respondió ${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.data) ? data.data : [];
  return items
    .map(s => ({
      id: String(s.id || ''),
      media_type: String(s.media_type || '').toUpperCase(), // IMAGE | VIDEO
      media_url: String(s.media_url || ''),
      thumbnail_url: String(s.thumbnail_url || ''),
      timestamp: String(s.timestamp || ''),
    }))
    .filter(s => s.id);
}

// ---------------------------------------------------------------------------
// 2. Bajar la imagen como data URL (para mandarla a visión)
//    Devuelve null si no es imagen, pesa de más o falla la descarga.
// ---------------------------------------------------------------------------
async function imageToDataUrl(url) {
  if (!url) return null;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  } catch (e) { return null; }
  if (!res.ok) return null;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.startsWith('image/')) return null; // videos u otros: se saltean
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  const mime = ct.split(';')[0].trim() || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// 3. Visión: extraer el texto visible de la historia (gpt-4o, detail low)
// ---------------------------------------------------------------------------
async function extractStoryText(dataUrl, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'Sos un lector de historias de Instagram de negocios argentinos. Mirás la imagen y transcribís SOLO el texto que aparece escrito en ella (títulos, promos, precios, horarios, anuncios, preguntas).\n' +
            'REGLA DURA: PROHIBIDO INVENTAR. Si la imagen no tiene texto, ambos arrays quedan vacíos. No adivines, no completes, no supongas lo que "quiso decir".\n' +
            'Respondé SOLO con este JSON, sin texto extra:\n' +
            '{"promos": ["..."], "anuncios": ["..."]}\n' +
            '- "promos": promociones, descuentos u ofertas con precio o vigencia que se lean en la imagen (strings cortos, máx 120 caracteres). Si no hay, [].\n' +
            '- "anuncios": anuncios importantes que se lean (nuevo horario, dirección, fecha de evento, pregunta a la audiencia). Si no hay, [].',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '¿Qué texto se lee en esta historia de Instagram?' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  let parsed = {};
  try { parsed = JSON.parse(data.choices[0].message.content || '{}'); } catch (e) { parsed = {}; }
  const arr = v => (Array.isArray(v) ? v.map(x => String(x).trim().slice(0, 140)).filter(Boolean).slice(0, 10) : []);
  return { promos: arr(parsed.promos), anuncios: arr(parsed.anuncios) };
}

// ---------------------------------------------------------------------------
// analyzeStories(igUserId, accessToken, apiKey)
// Nunca lanza: devuelve { ok, promos[], anuncios[], stories_count, error }.
// ---------------------------------------------------------------------------
async function analyzeStories(igUserId, accessToken, apiKey) {
  const out = { ok: false, promos: [], anuncios: [], stories_count: 0, error: '' };
  try {
    if (!apiKey) { out.error = 'Falta configurar la clave de OpenAI'; return out; }
    let stories;
    try {
      stories = await fetchStories(igUserId, accessToken);
    } catch (e) {
      out.error = e.message || 'No pudimos leer tus historias';
      return out;
    }
    out.stories_count = stories.length;
    const seen = new Set(); // dedupe entre historias
    const push = (list, arr) => {
      for (const s of arr) {
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        if (list.length < 20) list.push(s);
      }
    };
    for (const st of stories) {
      try {
        // Videos: se analiza el thumbnail; imágenes: la imagen directa.
        const src = st.media_type === 'VIDEO' ? st.thumbnail_url : st.media_url;
        const dataUrl = await imageToDataUrl(src);
        if (!dataUrl) continue; // sin imagen legible: se saltea
        const t = await extractStoryText(dataUrl, apiKey);
        push(out.promos, t.promos);
        push(out.anuncios, t.anuncios);
      } catch (e) { /* una historia fallida no rompe el análisis */ }
      await new Promise(r => setTimeout(r, 300)); // cortesía con la API
    }
    out.ok = true;
  } catch (e) {
    out.error = e.message || 'No pudimos analizar tus historias';
  }
  return out;
}

// ---------------------------------------------------------------------------
// storiesDnaPatch(cur, result)
// Patch para writeDna(uid, {...readDna(uid), ...patch}).
// Convención de fuentes obligatoria: dna_json.fuentes = { campo: 'etiqueta' }.
// ---------------------------------------------------------------------------
function storiesDnaPatch(cur, result) {
  const c = (cur && typeof cur === 'object') ? cur : {};
  const fuentes = (c.fuentes && typeof c.fuentes === 'object' && !Array.isArray(c.fuentes)) ? { ...c.fuentes } : {};
  fuentes.stories_promos = '📱 Historias';
  fuentes.stories_anuncios = '📱 Historias';
  return {
    stories_promos: Array.isArray(result.promos) ? result.promos : [],
    stories_anuncios: Array.isArray(result.anuncios) ? result.anuncios : [],
    stories_count: Number(result.stories_count) || 0,
    stories_analyzed_at: new Date().toISOString(),
    fuentes,
  };
}

module.exports = { fetchStories, analyzeStories, storiesDnaPatch };
