// client-brief.js — Brief Unificado del Cliente.
//
// UNA sola fuente de verdad sobre quién es el cliente, compuesta de:
//   NEGOCIO (qué vende, a quién, dónde, propuesta) — minado de la bio del IG + formulario
//   VOZ (cómo escribe) — resumen del Caption Style Lock (caption-style.js)
//   VISUAL (cómo se ve) — resumen del Style Lock visual (style-visual.js)
//   MARCA (logo, colores, fotos disponibles)
//
// - mineBio(db, userId): trae la bio del IG conectado y la estructura con gpt-4o-mini.
// - buildClientBrief(db, userId): compone el brief desde bio minada + perfiles + locks + formulario.
// - refreshClientBrief(db, userId): mina + reconstruye + guarda en client_briefs.
// - getBrief(db, userId): lee el brief guardado (lo construye si falta).
// - briefBlock(brief): bloque compacto (~15 líneas) para anteponer a los prompts.
// - briefBlockFor(db, userId): atajo defensivo para server.js.
//
// Contrato: NUNCA lanza. Las funciones async devuelven {ok:true,...} o {ok:false, error}.
// getBrief/briefBlock/briefBlockFor devuelven null/'' ante cualquier falla.

const { getCreds } = require('./insights');

let costs = null;
try { costs = require('./costs'); } catch (_) { costs = null; }

const BIO_MODEL = 'gpt-4o-mini';

const BIO_SYSTEM = [
  'Sos un analista de negocios. Te paso la bio de Instagram de un negocio (puede estar vacía o ser pobre).',
  'Extraé lo que puedas y devolvé SOLO JSON con estas claves (string, "" si no hay dato):',
  '- que_vende: qué productos/servicios vende (ej: "pizzas a la parrilla, empanadas")',
  '- ubicacion: zona, barrio, ciudad o alcance de entrega (ej: "Palermo, CABA" / "envíos a todo el país")',
  '- publico: a quién le habla (ej: "jóvenes 20-35", "familias del barrio")',
  '- contacto: datos de contacto si aparecen (WhatsApp, email, dirección)',
  '- propuesta_valor: la promesa diferencial en 1 línea (ej: "la pizza más rápida del barrio")',
  'Todo en español rioplatense, conciso. No inventes: si la bio no dice algo, dejá "".',
].join('\n');

function getOpenAiKey(db, userId) {
  try {
    const s = db.prepare('SELECT openai_key FROM settings WHERE user_id = ?').get(userId) || {};
    return s.openai_key || process.env.OPENAI_API_KEY || '';
  } catch (_) {
    return process.env.OPENAI_API_KEY || '';
  }
}

function getProfile(db, userId) {
  try {
    return db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || {};
  } catch (_) { return {}; }
}

function getSettingsRow(db, userId) {
  try {
    return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) || {};
  } catch (_) { return {}; }
}

// Bio cruda del IG conectado (Graph API). Devuelve {username, bio} o null.
async function fetchIgBio(db, userId) {
  try {
    const creds = getCreds(db, userId);
    if (!creds) return null;
    const q = new URLSearchParams({
      access_token: creds.accessToken,
      fields: 'username,biography',
    }).toString();
    const r = await fetch(`https://graph.instagram.com/v26.0/${creds.igUserId}?${q}`, {
      signal: AbortSignal.timeout(25000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) return null;
    return {
      username: typeof data.username === 'string' ? data.username : '',
      bio: typeof data.biography === 'string' ? data.biography.trim().slice(0, 600) : '',
    };
  } catch (_) {
    return null;
  }
}

function parseBioMined(data) {
  try {
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : '';
    if (!content) return null;
    const j = JSON.parse(content);
    const str = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
    const mined = {
      que_vende: str(j.que_vende),
      ubicacion: str(j.ubicacion),
      publico: str(j.publico),
      contacto: str(j.contacto),
      propuesta_valor: str(j.propuesta_valor),
    };
    // Sin ningún dato útil, no hay minado válido.
    if (!mined.que_vende && !mined.ubicacion && !mined.publico && !mined.contacto && !mined.propuesta_valor) return null;
    return mined;
  } catch (_) {
    return null;
  }
}

async function bioAnalyze(apiKey, bioText, userId) {
  const body = {
    model: BIO_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: BIO_SYSTEM },
      { role: 'user', content: `Bio a analizar:\n\n${bioText}` },
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
      try { costs.trackUsage({ feature: 'client-brief', userId, model: BIO_MODEL, json: data }); } catch (_) {}
    }
    return data;
  }
  let data = await callOnce(null);
  let parsed = parseBioMined(data);
  if (!parsed) {
    data = await callOnce('El JSON anterior vino roto o vacío. Devolvé SOLO JSON válido con las 5 claves, sin texto extra.');
    parsed = parseBioMined(data);
  }
  if (!parsed) throw new Error('bio JSON inválido o sin datos');
  return parsed;
}

// Minería de bio: trae la bio del IG conectado y la estructura.
// Guarda bio_raw + bio_mined_json en client_briefs. Nunca lanza.
async function mineBio(db, userId) {
  try {
    const ig = await fetchIgBio(db, userId);
    if (!ig || !ig.bio) return { ok: false, error: ig ? 'bio vacía' : 'sin IG conectado' };
    const apiKey = getOpenAiKey(db, userId);
    if (!apiKey) return { ok: false, error: 'sin clave OpenAI' };
    const mined = await bioAnalyze(apiKey, ig.bio, userId);
    const at = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO client_briefs (user_id, bio_raw, bio_mined_json, updated_at)
        VALUES (?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET bio_raw=excluded.bio_raw, bio_mined_json=excluded.bio_mined_json, updated_at=excluded.updated_at`)
        .run(userId, ig.bio, JSON.stringify({ ...mined, ig_username: ig.username, mined_at: at }), at);
    } catch (_) { /* tabla puede no existir aún en este boot: el caller la crea */ }
    return { ok: true, mined, bio_raw: ig.bio };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'error desconocido' };
  }
}

function getCaptionSummary(db, userId) {
  try {
    const row = db.prepare('SELECT profile_json FROM ig_caption_style WHERE user_id = ?').get(userId);
    if (!row || !row.profile_json) return null;
    const p = JSON.parse(row.profile_json);
    if (!p || !p.tone) return null;
    return p;
  } catch (_) { return null; }
}

function getVisualSummary(db, userId) {
  try {
    const row = db.prepare('SELECT profile_json FROM ig_visual_style WHERE user_id = ?').get(userId);
    if (!row || !row.profile_json) return null;
    const p = JSON.parse(row.profile_json);
    if (!p || typeof p !== 'object') return null;
    return p;
  } catch (_) { return null; }
}

function getBrandInfo(db, userId) {
  const info = { logo: false, fotos: 0, colores: [] };
  try {
    const l = db.prepare(`SELECT id FROM assets WHERE user_id = ? AND kind = 'logo' LIMIT 1`).get(userId);
    info.logo = !!l;
  } catch (_) {}
  try {
    const c = db.prepare(`SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo'`).get(userId);
    info.fotos = (c && c.n) || 0;
  } catch (_) {}
  try {
    const s = getSettingsRow(db, userId);
    let arr = [];
    try { arr = JSON.parse(s.brand_colors || '[]'); } catch (_) { arr = []; }
    if (Array.isArray(arr)) info.colores = arr.filter((c) => typeof c === 'string').slice(0, 5);
  } catch (_) {}
  return info;
}

// Compone el brief desde todas las fuentes. Nunca lanza.
function buildClientBrief(db, userId) {
  try {
    const profile = getProfile(db, userId);
    const settings = getSettingsRow(db, userId);
    let bioMined = null, bioRaw = '';
    try {
      const row = db.prepare('SELECT bio_raw, bio_mined_json FROM client_briefs WHERE user_id = ?').get(userId);
      if (row) {
        bioRaw = row.bio_raw || '';
        try { bioMined = JSON.parse(row.bio_mined_json || '{}'); } catch (_) { bioMined = null; }
        if (bioMined && typeof bioMined !== 'object') bioMined = null;
      }
    } catch (_) {}
    const cap = getCaptionSummary(db, userId);
    const vis = getVisualSummary(db, userId);
    const brand = getBrandInfo(db, userId);

    const queVende = (bioMined && bioMined.que_vende) || String(profile.description || '').slice(0, 200) || '';
    const brief = {
      negocio: {
        nombre: String(profile.business_name || '').slice(0, 80),
        rubro: String(profile.category || 'otro').slice(0, 60),
        que_vende: queVende,
        propuesta_valor: (bioMined && bioMined.propuesta_valor) || '',
        publico: (bioMined && bioMined.publico) || '',
        ubicacion: (bioMined && bioMined.ubicacion) || '',
        contacto: (bioMined && bioMined.contacto) || '',
      },
      voz: cap ? {
        tone: cap.tone || '',
        emoji_style: cap.emoji_style || '',
        cta_style: cap.cta_style || '',
        persona: cap.persona || '',
        avg_length: cap.avg_length || 0,
        fuente: 'instagram',
      } : { fuente: 'formulario', tone: String(profile.tone || 'canchero').slice(0, 60) },
      visual: (vis && (vis.palette || vis.mood || vis.recurring_subject)) ? {
        palette: Array.isArray(vis.palette) ? vis.palette.slice(0, 5) : [],
        mood: vis.mood || '',
        composition: vis.composition || '',
        recurring_subject: vis.recurring_subject || '',
        fuente: 'instagram',
      } : { fuente: 'sin_analizar' },
      marca: {
        logo: brand.logo,
        fotos: brand.fotos,
        colores: brand.colores,
        ig_username: String(profile.ig_username || ''),
      },
      bio_raw: bioRaw,
      updated_at: new Date().toISOString(),
    };
    return brief;
  } catch (_) {
    return null;
  }
}

function saveBrief(db, userId, brief) {
  try {
    const at = new Date().toISOString();
    db.prepare(`INSERT INTO client_briefs (user_id, brief_json, updated_at)
      VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET brief_json=excluded.brief_json, updated_at=excluded.updated_at`)
      .run(userId, JSON.stringify(brief), at);
    return true;
  } catch (_) {
    return false;
  }
}

function getBrief(db, userId) {
  try {
    const row = db.prepare('SELECT brief_json FROM client_briefs WHERE user_id = ?').get(userId);
    if (row && row.brief_json) {
      const b = JSON.parse(row.brief_json);
      if (b && typeof b === 'object' && b.negocio) return b;
    }
  } catch (_) {}
  // Sin brief guardado: construir al vuelo (sin persistir acá).
  try { return buildClientBrief(db, userId); } catch (_) { return null; }
}

// Bloque compacto (~15 líneas) para anteponer a los prompts de generación.
// Omite con elegancia las secciones sin datos.
function briefBlock(brief) {
  try {
    if (!brief || typeof brief !== 'object' || !brief.negocio) return '';
    const n = brief.negocio, v = brief.voz || {}, s = brief.visual || {}, m = brief.marca || {};
    const lines = ['BRIEF DEL CLIENTE (todo lo que generes es PARA ESTE NEGOCIO — usalo como contexto):'];
    const nombre = [n.nombre, n.rubro].filter(Boolean).join(' · ');
    if (nombre) lines.push(`- Negocio: ${nombre}${n.que_vende ? ` — vende: ${n.que_vende}` : ''}`);
    else if (n.que_vende) lines.push(`- Negocio: vende ${n.que_vende}`);
    if (n.propuesta_valor) lines.push(`- Propuesta: ${n.propuesta_valor}`);
    const pub = [n.publico, n.ubicacion].filter(Boolean).join(' · ');
    if (pub) lines.push(`- Cliente ideal: ${pub}`);
    if (n.contacto) lines.push(`- Contacto: ${n.contacto}`);
    if (v.fuente === 'instagram' && v.tone) {
      const bits = [`habla ${v.tone}`];
      if (v.emoji_style && v.emoji_style !== 'variado') bits.push(`emojis: ${v.emoji_style}`);
      if (v.cta_style && v.cta_style !== 'variado') bits.push(`CTA típico: ${v.cta_style}`);
      if (v.persona && v.persona !== 'variado') bits.push(v.persona);
      lines.push(`- Voz (de su Instagram real): ${bits.join(' · ')}`);
    } else if (v.tone) {
      lines.push(`- Voz: ${v.tone}`);
    }
    if (s.fuente === 'instagram') {
      const bits = [];
      if (s.palette && s.palette.length) bits.push(`paleta ${s.palette.join(', ')}`);
      if (s.mood) bits.push(s.mood);
      if (s.recurring_subject) bits.push(`protagonista: ${s.recurring_subject}`);
      if (s.composition) bits.push(s.composition);
      if (bits.length) lines.push(`- Visual (de su Instagram real): ${bits.join(' · ')}`);
    }
    const mbits = [];
    mbits.push(m.logo ? 'logo ✓' : 'sin logo');
    mbits.push(`${m.fotos || 0} fotos`);
    if (m.colores && m.colores.length) mbits.push(m.colores.join(', '));
    lines.push(`- Marca: ${mbits.join(' · ')}`);
    if (m.ig_username) lines.push(`- Instagram: @${m.ig_username}`);
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

// Flujo completo: mina la bio (si hay IG) + reconstruye + guarda. Nunca lanza.
async function refreshClientBrief(db, userId) {
  try {
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS client_briefs (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        bio_raw TEXT DEFAULT '',
        bio_mined_json TEXT NOT NULL DEFAULT '{}',
        brief_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    } catch (_) {}
    try { await mineBio(db, userId); } catch (_) {}
    const brief = buildClientBrief(db, userId);
    if (!brief) return { ok: false, error: 'no se pudo componer el brief' };
    saveBrief(db, userId, brief);
    return { ok: true, brief, updated_at: brief.updated_at };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'error desconocido' };
  }
}

// Atajo defensivo para server.js: bloque listo o ''.
function briefBlockFor(db, userId) {
  try {
    const b = getBrief(db, userId);
    return briefBlock(b);
  } catch (_) {
    return '';
  }
}

module.exports = {
  mineBio,
  buildClientBrief,
  refreshClientBrief,
  getBrief,
  briefBlock,
  briefBlockFor,
};
