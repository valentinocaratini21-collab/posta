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
function captionPromptExtras(db, userId) {
  try {
    const parts = [CAPTION_CHECKLIST];
    let ar = false;
    try { ar = isArgentineClient(db, userId); } catch (_) {}
    if (ar) parts.push('IDIOMA: el cliente es argentino — escribí TODO en rioplatense con voseo ("vos").');
    let block = '';
    try { block = captionStyleBlock(getCaptionStyle(db, userId)); } catch (_) {}
    if (block) parts.push(block);
    return parts.join('\n\n');
  } catch (_) {
    return CAPTION_CHECKLIST;
  }
}

module.exports = {
  analyzeCaptionStyle,
  getCaptionStyle,
  captionStyleBlock,
  captionPromptExtras,
  isArgentineClient,
  CAPTION_CHECKLIST,
};
