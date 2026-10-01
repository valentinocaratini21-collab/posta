// style-visual.js — Análisis visual del feed real del cliente (Instagram conectado).
//
// analyzeVisualStyle(db, userId): baja los últimos posteos del IG del cliente,
// los analiza con visión (gpt-4o) y guarda un perfil visual JSON en ig_visual_style.
// getVisualStyle(db, userId): lee el perfil guardado (solo ref_paths cuyos archivos existen).
// visualStyleBlock(profile): bloque de texto para inyectar en el prompt de generación.
//
// Contrato: NUNCA lanza. analyzeVisualStyle devuelve {ok:true, profile, analyzed_at}
// o {ok:false, error}. getVisualStyle devuelve profile|null. visualStyleBlock devuelve string.

const fs = require('fs');
const path = require('path');

const { getCreds } = require('./insights');

let costs = null;
try { costs = require('./costs'); } catch (_) { costs = null; }

// Mismo cálculo que server.js (DATA_DIR / MEDIA_DIR).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(DATA_DIR, 'media');

const MAX_IMAGES = 6;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB por imagen
const VISION_MODEL = 'gpt-4o';

const SYSTEM_PROMPT = 'Sos un director de arte. Analizás 6 posteos de Instagram de un negocio y devolvés SOLO JSON con: recurring_subject (qué sujeto/objeto/personaje se repite, o \'ninguno\'), subject_always_present (bool), text_overlay (\'titular grande siempre\' / \'texto mínimo\' / \'sin texto\' + estilo), palette (hasta 5 hex), composition (ej: \'personaje centrado, fondo simple\'), mood (ej: \'cálido y cercano\'), notes (1 línea). Todo en español rioplatense, conciso.';

function getOpenAiKey(db, userId) {
  try {
    const s = db.prepare('SELECT openai_key FROM settings WHERE user_id = ?').get(userId) || {};
    return s.openai_key || process.env.OPENAI_API_KEY || '';
  } catch (_) {
    return process.env.OPENAI_API_KEY || '';
  }
}

// Descarga una imagen con timeout y cap de tamaño. Devuelve Buffer o null.
async function downloadImage(url, timeoutMs = 20000) {
  try {
    if (!url) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok || !r.body) return null;
    const cl = parseInt(r.headers.get('content-length') || '0', 10);
    if (cl > MAX_BYTES) return null; // demasiado pesada: saltear
    const reader = r.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { try { await reader.cancel(); } catch (_) {} return null; }
      chunks.push(value);
    }
    return chunks.length ? Buffer.concat(chunks) : null;
  } catch (_) {
    return null; // la que falle se saltea
  }
}

function asDataUri(buf) {
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

async function visionAnalyze(apiKey, buffers, userId) {
  const imageParts = buffers.map((buf) => ({
    type: 'image_url',
    image_url: { url: asDataUri(buf), detail: 'low' },
  }));
  const body = {
    model: VISION_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Analizá estas ${buffers.length} imágenes de posteos de Instagram de un negocio y devolvé el JSON de perfil visual.` },
          ...imageParts,
        ],
      },
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
      try { costs.trackUsage({ feature: 'style-visual', userId, model: VISION_MODEL, images: 0, json: data }); } catch (_) {}
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
  if (!parsed) throw new Error('vision JSON inválido');
  return parsed;
}

function parseProfile(data) {
  try {
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (!content) return null;
    const j = JSON.parse(content);
    const palette = Array.isArray(j.palette)
      ? j.palette.filter((h) => typeof h === 'string').slice(0, 5) : [];
    return {
      recurring_subject: typeof j.recurring_subject === 'string' ? j.recurring_subject.trim() : '',
      subject_always_present: !!j.subject_always_present,
      text_overlay: typeof j.text_overlay === 'string' ? j.text_overlay.trim() : '',
      palette,
      composition: typeof j.composition === 'string' ? j.composition.trim() : '',
      mood: typeof j.mood === 'string' ? j.mood.trim() : '',
      notes: typeof j.notes === 'string' ? j.notes.trim() : '',
    };
  } catch (_) {
    return null;
  }
}

// Logo auto-extraído: al completar el análisis visual, Posta descarga sola la foto
// de perfil del IG como candidata y se la muestra al cliente en el chat para confirmar.
// Solo actúa si no hay logo de marca, no hay candidata previa y no fue descartada antes.
// Si el perfil detectó subject_always_present con sujeto tipo personaje/mascota y hay
// ref_paths, prefiere la primera ref (ya descargada, del feed real); si no, la foto
// de perfil. NUNCA lanza: devuelve {ok:true, path, new:true} o {ok:false}.
async function extractLogoCandidate(db, userId, creds) {
  try {
    let s = {};
    try {
      s = db.prepare('SELECT logo_candidate, logo_candidate_dismissed FROM settings WHERE user_id = ?').get(userId) || {};
    } catch (_) { return { ok: false }; }
    let hasLogo = false;
    try {
      hasLogo = !!db.prepare(`SELECT id FROM assets WHERE user_id = ? AND kind = 'logo' LIMIT 1`).get(userId);
    } catch (_) {}
    if (hasLogo) return { ok: false }; // ya tiene logo
    if (s.logo_candidate && String(s.logo_candidate).trim()) return { ok: false }; // ya hay candidata
    if (s.logo_candidate_dismissed) return { ok: false }; // la descartó antes

    let srcBuf = null;
    // Preferir la primera ref del análisis si el sujeto recurrente es el protagonista
    // (personaje/mascota del feed real).
    let profile = null;
    try { profile = getVisualStyle(db, userId); } catch (_) { profile = null; }
    const subject = profile && typeof profile.recurring_subject === 'string' ? profile.recurring_subject.toLowerCase() : '';
    const isCharacter = !!(profile && profile.subject_always_present && profile.recurring_subject
      && /personaje|mascota|avatar|muñeco|muñeca|dibujo|ilustraci|caricatura|character|mascot/i.test(subject));
    if (isCharacter && Array.isArray(profile.ref_paths) && profile.ref_paths.length) {
      try { srcBuf = fs.readFileSync(profile.ref_paths[0]); } catch (_) { srcBuf = null; }
    }
    // Fallback: foto de perfil del IG.
    if ((!srcBuf || !srcBuf.length) && creds && creds.igUserId && creds.accessToken) {
      try {
        const q = new URLSearchParams({ access_token: creds.accessToken, fields: 'profile_picture_url' }).toString();
        const r = await fetch(`https://graph.instagram.com/v26.0/${creds.igUserId}?${q}`, { signal: AbortSignal.timeout(20000) });
        const data = await r.json().catch(() => ({}));
        const pic = (r.ok && !data.error && typeof data.profile_picture_url === 'string') ? data.profile_picture_url : null;
        if (pic) srcBuf = await downloadImage(pic, 20000);
      } catch (_) { srcBuf = null; }
    }
    if (!srcBuf || !srcBuf.length) return { ok: false };

    try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch (_) {}
    const name = `logo-candidate-${userId}-${Date.now()}.jpg`;
    const abs = path.join(MEDIA_DIR, name);
    try { fs.writeFileSync(abs, srcBuf); } catch (_) { return { ok: false }; }
    const webPath = `/media/${name}`;
    try { db.prepare('UPDATE settings SET logo_candidate = ? WHERE user_id = ?').run(webPath, userId); }
    catch (_) { return { ok: false }; }
    return { ok: true, path: webPath, new: true };
  } catch (_) {
    return { ok: false };
  }
}

async function analyzeVisualStyle(db, userId) {
  try {
    const creds = getCreds(db, userId);
    if (!creds) return { ok: false, error: 'sin IG conectado' };

    const apiKey = getOpenAiKey(db, userId);
    if (!apiKey) return { ok: false, error: 'sin clave OpenAI' };

    // Últimos posteos del IG conectado (patrón de insights.igGet: AbortSignal.timeout(25000)
    // y manejo de data.error; igGet no se exporta, así que se inlining aquí).
    const IG_HOST = 'https://graph.instagram.com';
    const API_VERSION = 'v26.0';
    const media = await (async () => {
      const q = new URLSearchParams({
        access_token: creds.accessToken,
        fields: 'id,media_type,media_url,thumbnail_url,timestamp',
        limit: '12',
      }).toString();
      const r = await fetch(`${IG_HOST}/${API_VERSION}/${creds.igUserId}/media?${q}`, { signal: AbortSignal.timeout(25000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) throw new Error((data.error && data.error.message) || `IG ${r.status}`);
      return data;
    })();

    const items = Array.isArray(media.data) ? media.data : [];

    // Preferir IMAGE y CAROUSEL_ALBUM (media_url); aceptar hasta 2 VIDEO (thumbnail_url).
    const images = [];
    const videos = [];
    for (const m of items) {
      const url = m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : (m.media_url || m.thumbnail_url);
      if (!url) continue;
      if (m.media_type === 'VIDEO') { if (videos.length < 2) videos.push({ url, ts: m.timestamp }); }
      else if (images.length < MAX_IMAGES) images.push({ url, ts: m.timestamp });
      if (images.length + videos.length >= MAX_IMAGES) break;
    }
    const picked = [...images, ...videos].slice(0, MAX_IMAGES);
    if (!picked.length) return { ok: false, error: 'sin media con imagen' };

    // Descargar (las que fallen se saltean).
    const buffers = [];
    for (const p of picked) {
      const buf = await downloadImage(p.url);
      if (buf) buffers.push(buf);
      if (buffers.length >= MAX_IMAGES) break;
    }
    if (!buffers.length) return { ok: false, error: 'no se pudo descargar ninguna imagen' };

    // Análisis con visión.
    const profile = await visionAnalyze(apiKey, buffers, userId);

    const analyzed_at = new Date().toISOString();

    // Guardar 1-2 imágenes de referencia.
    const refDir = path.join(MEDIA_DIR, 'style-visual', String(userId));
    try { fs.mkdirSync(refDir, { recursive: true }); } catch (_) {}
    const ref_paths = [];
    for (let i = 0; i < Math.min(2, buffers.length); i++) {
      const p = path.join(refDir, `ref-${i}.jpg`);
      try { fs.writeFileSync(p, buffers[i]); ref_paths.push(p); } catch (_) {}
    }
    profile.ref_paths = ref_paths;
    profile.analyzed_at = analyzed_at;

    db.prepare(`INSERT INTO ig_visual_style (user_id, profile_json, analyzed_at)
      VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json, analyzed_at=excluded.analyzed_at`)
      .run(userId, JSON.stringify(profile), analyzed_at);

    // Logo auto-extraído: una sola vez por usuario, ofrecer la foto de perfil
    // (o la ref del sujeto protagonista) como logo de marca. Mensaje con marcador
    // [logo-candidate:path] que el frontend renderiza como banner confirmable.
    // NUNCA lanza.
    try {
      const mc = await extractLogoCandidate(db, userId, creds);
      if (mc && mc.ok && mc.new && mc.path) {
        let st = {};
        try { st = db.prepare('SELECT logo_candidate_dismissed FROM settings WHERE user_id = ?').get(userId) || {}; } catch (_) { st = {}; }
        let hasLogo = false;
        try { hasLogo = !!db.prepare(`SELECT id FROM assets WHERE user_id = ? AND kind = 'logo' LIMIT 1`).get(userId); } catch (_) {}
        if (!hasLogo && !st.logo_candidate_dismissed) {
          let dup = null;
          try { dup = db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND (text LIKE '%[logo-candidate%' OR text LIKE '%[mascot-candidate%')`).get(userId); } catch (_) { dup = null; }
          if (!dup || !dup.c) {
            try {
              db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(userId, 'assistant',
                `¿Este es el logo de tu marca? Lo uso en todos tus diseños 👇 [logo-candidate:${mc.path}]`);
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    return { ok: true, profile, analyzed_at };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'error desconocido' };
  }
}

function getVisualStyle(db, userId) {
  try {
    const row = db.prepare('SELECT profile_json, analyzed_at FROM ig_visual_style WHERE user_id = ?').get(userId);
    if (!row || !row.profile_json) return null;
    const profile = JSON.parse(row.profile_json);
    if (!profile || typeof profile !== 'object') return null;
    const refs = Array.isArray(profile.ref_paths) ? profile.ref_paths : [];
    profile.ref_paths = refs.filter((p) => typeof p === 'string' && fs.existsSync(p));
    if (!profile.analyzed_at && row.analyzed_at) profile.analyzed_at = row.analyzed_at;
    return profile;
  } catch (_) {
    return null;
  }
}

function visualStyleBlock(profile) {
  try {
    if (!profile || typeof profile !== 'object') return '';
    const subj = typeof profile.recurring_subject === 'string' ? profile.recurring_subject.trim() : '';
    if (!subj) return '';
    const lines = [
      'LÍNEA VISUAL DEL CLIENTE (su Instagram real se ve así — tus imágenes DEBEN seguir esta línea):',
      `- Sujeto recurrente: ${subj}${profile.subject_always_present ? ', protagonista en todos los posteos' : ''}`,
    ];
    if (profile.text_overlay) lines.push(`- Texto sobre imagen: ${profile.text_overlay}`);
    if (Array.isArray(profile.palette) && profile.palette.length) lines.push(`- Paleta: ${profile.palette.join(', ')}`);
    if (profile.composition) lines.push(`- Composición: ${profile.composition}`);
    if (profile.mood) lines.push(`- Mood: ${profile.mood}`);
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

module.exports = { analyzeVisualStyle, getVisualStyle, visualStyleBlock, extractLogoCandidate };
