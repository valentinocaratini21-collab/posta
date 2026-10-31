// ig-comments.js — Minería de comentarios de Instagram ("Expertos en información", Track 1)
// Idea de Valentino: sacar información del cliente pidiéndole lo menos posible.
//
// Con el token del cliente: trae los últimos ~20 posteos y hasta 50 comentarios
// por posteo, y deja que gpt-4o-mini extraiga de ellos preguntas frecuentes,
// objeciones y deseos. SOLO lee: nunca publica, comenta ni hace nada en IG.
// Los datos se guardan en el ADN con fuente '💬 Comentarios IG'.
//
// Exporta: { mineComments, fetchCommentsBundle, buildDnaPatch }
'use strict';
const pp = require('./preguntas-posteos'); // PP-PREGUNTAS-POSTEOS-IG

const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';
const MEDIA_LIMIT = 20;      // últimos ~20 posteos
const COMMENTS_LIMIT = 50;   // comentarios por posteo
const GPT_TIMEOUT_MS = 45000;
const IG_FETCH_TIMEOUT_MS = 15000;
const SLEEP_BETWEEN_MEDIA_MS = 300; // cortés con la API

const SRC_LABEL = '💬 Comentarios IG';

async function igGet(path, params, accessToken) {
  const qs = new URLSearchParams(params);
  qs.set('access_token', accessToken);
  const res = await fetch(`${IG_HOST}/${API_VERSION}${path}?${qs}`, {
    signal: AbortSignal.timeout(IG_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  try { return await res.json(); } catch (e) { return null; }
}

// Trae los últimos 20 posteos y hasta 50 comentarios por cada uno.
// → { posts, comments, items: [{ caption, comments: [{ username, text }] }] }
// Nunca lanza: errores por posteo se saltean con gracia.
async function fetchCommentsBundle(igUserId, accessToken) {
  const media = await igGet(`/${igUserId}/media`,
    { fields: 'id,caption,timestamp', limit: String(MEDIA_LIMIT) }, accessToken);
  const items = (media && Array.isArray(media.data)) ? media.data : [];
  if (!items.length) return { posts: 0, comments: 0, items: [] };
  const bundle = [];
  let commentCount = 0;
  for (const m of items) {
    let comments = [];
    try {
      const c = await igGet(`/${m.id}/comments`,
        { fields: 'text,username', limit: String(COMMENTS_LIMIT) }, accessToken);
      const rows = (c && Array.isArray(c.data)) ? c.data : [];
      comments = rows
        .map(r => ({ username: String(r.username || ''), text: String(r.text || '').trim() }))
        .filter(r => r.text);
      commentCount += comments.length;
    } catch (e) { comments = []; }
    if (comments.length) bundle.push({ caption: String(m.caption || '').slice(0, 200), comments });
    await new Promise(r => setTimeout(r, SLEEP_BETWEEN_MEDIA_MS));
  }
  return { posts: bundle.length, comments: commentCount, items: bundle };
}

// (Tanda feed 6C · ítem 10) Comentarios de UN posteo puntual, por su
// ig_media_id — la misma vía de lectura de arriba (GET /{media}/comments
// con el token de la conexión IG de la cuenta), pero sin listar el feed
// entero: el detalle del posteo publicado los muestra tal cual vinieron.
// → [{ id, author, text, at }] en el ORDEN DE LA FUENTE (la Graph API
// devuelve los más recientes primero). A diferencia de fetchCommentsBundle
// (que nunca lanza porque minaba en lote), esta SÍ lanza ante un fallo de
// la fuente (token vencido, IG caído): el endpoint del detalle lo captura
// y responde «sin lista», nunca un 500.
async function fetchCommentsForMedia(igMediaId, accessToken) {
  if (!igMediaId || !accessToken) throw new Error('ig_comments_no_source');
  const res = await fetch(`${IG_HOST}/${API_VERSION}/${encodeURIComponent(String(igMediaId))}/comments?` +
    new URLSearchParams({ fields: 'id,text,username,timestamp', limit: String(COMMENTS_LIMIT), access_token: accessToken }).toString(),
    { signal: AbortSignal.timeout(IG_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error('ig_comments_' + res.status);
  const data = await res.json().catch(() => null);
  if (!data || data.error) throw new Error('ig_comments_error');
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows
    .map(r => ({ id: String(r.id || ''), author: String(r.username || ''), text: String(r.text || '').trim(), at: String(r.timestamp || '') }))
    .filter(r => r.text);
}

// Una llamada a gpt-4o-mini que extrae de los comentarios:
// preguntas_frecuentes[], objeciones[], deseos[].
// PROHIBIDO inventar: solo lo que dicen los comentarios; pocos comentarios → arrays cortos.
async function mineWithGpt(items, apiKey) {
  const lines = [];
  for (const it of items) {
    for (const c of it.comments) {
      const t = c.text.replace(/\s+/g, ' ').slice(0, 300);
      if (t) lines.push(`@${c.username}: ${t}`);
    }
  }
  const system =
    'Sos un investigador de mercado argentino que lee comentarios de Instagram de un negocio local. ' +
    'Analizás los comentarios y extraés patrones reales: preguntas que se repiten, objeciones y deseos de los seguidores.\n' +
    'Hablás en español rioplatense, directo y sin vueltas.\n' +
    'REGLA DURA: PROHIBIDO INVENTAR. Usá SOLO lo que dicen los comentarios, con sus palabras. ' +
    'Si hay pocos comentarios, los arrays quedan cortos: no los completes con cosas genéricas.\n' +
    'Respondé SOLO con un JSON con esta forma exacta:\n' +
    '{"preguntas_frecuentes": ["pregunta 1", ...], "objeciones": ["objeción 1", ...], "deseos": ["deseo 1", ...]}\n' +
    '- preguntas_frecuentes: preguntas que hacen los seguidores (precio, ubicación, horarios, envíos, stock...). Cortitas, máx 10.\n' +
    '- objeciones: frenos o quejas que se leen entre líneas ("es caro", "no hacen envíos", "queda lejos"). Cortitas, máx 10.\n' +
    '- deseos: pedidos de productos o servicios que el negocio todavía no ofrece ("hacen en talle m?", "traigan tal cosa"). Cortitos, máx 10.\n' +
    '- Si no hay nada claro en alguna categoría, ese array va vacío [].';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: 'Comentarios de los últimos posteos (cada línea: @usuario: comentario):\n' + lines.join('\n').slice(0, 12000) },
      ],
    }),
    signal: AbortSignal.timeout(GPT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('openai_' + res.status);
  const data = await res.json();
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  let parsed = {};
  try { parsed = JSON.parse(raw || '{}'); } catch (e) { parsed = {}; }
  const arr = v => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 10) : []);
  return {
    preguntas_frecuentes: arr(parsed.preguntas_frecuentes),
    objeciones: arr(parsed.objeciones),
    deseos: arr(parsed.deseos),
  };
}

// buildDnaPatch(dna, mined) → patch listo para mergear con writeDna:
// comments_analyzed_at, comments_counts y los arrays (solo si hay algo nuevo),
// con fuentes etiquetadas '💬 Comentarios IG' según la convención de tracks.
function buildDnaPatch(dna, mined) {
  const cur = (dna && typeof dna === 'object') ? dna : {};
  const m = (mined && typeof mined === 'object') ? mined : {};
  const fuentes = { ...(cur.fuentes || {}),
    preguntas_frecuentes: SRC_LABEL, objeciones: SRC_LABEL, deseos: SRC_LABEL };
  const patch = {
    comments_analyzed_at: new Date().toISOString(),
    comments_counts: (m.counts && typeof m.counts === 'object') ? m.counts : {},
    fuentes,
  };
  const clean = v => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 10) : []);
  const faqs = clean(m.preguntas_frecuentes);
  if (faqs.length) patch.preguntas_frecuentes = faqs.map(p => ({ pregunta: p.slice(0, 200), respuesta: '' }));
  const obj = clean(m.objeciones);
  if (obj.length) patch.objeciones = obj.map(s => s.slice(0, 200));
  const des = clean(m.deseos);
  if (des.length) patch.deseos = des.map(s => s.slice(0, 200));
  return patch;
}

// mineComments(igUserId, accessToken, apiKey)
// → { preguntas_frecuentes[], objeciones[], deseos[], counts } o { error } con mensaje amable.
// Nunca lanza: cualquier fallo (sin token, sin comentarios, IG caído) → { error }.
async function mineComments(igUserId, accessToken, apiKey) {
  try {
    if (!igUserId || !accessToken) return { error: 'Conectá tu Instagram para analizar tus comentarios' };
    if (!apiKey) return { error: 'Todavía no podemos usar la IA, probá de nuevo en un rato' };
    const bundle = await fetchCommentsBundle(igUserId, accessToken);
    if (!bundle.comments) return { error: 'No encontramos comentarios recientes en tus posteos. Cuando tus seguidores comenten más, los analizamos.' };
    // PP-PREGUNTAS-POSTEOS-IG: agrupación determinística de las
    // preguntas reales del mismo bundle (sin llamada extra a IG ni a GPT).
    const gruposPreguntas = (() => {
      try {
        const todos = [];
        for (const it of (bundle.items || [])) for (const c of (it.comments || [])) todos.push(c);
        return pp.groupQuestions(todos);
      } catch (e) { return []; }
    })();
    let mined;
    try {
      mined = await mineWithGpt(bundle.items, apiKey);
    } catch (e) {
      return { error: 'La IA no pudo analizar los comentarios ahora, probá de nuevo en un rato' };
    }
    return {
      preguntas_frecuentes: mined.preguntas_frecuentes,
      grupos_preguntas: gruposPreguntas, // PP-PREGUNTAS-POSTEOS-IG
      objeciones: mined.objeciones,
      deseos: mined.deseos,
      counts: { posts: bundle.posts, comments: bundle.comments },
    };
  } catch (e) {
    return { error: 'No pudimos traer tus comentarios de Instagram, probá de nuevo en un rato' };
  }
}

module.exports = { mineComments, fetchCommentsBundle, buildDnaPatch, fetchCommentsForMedia };
