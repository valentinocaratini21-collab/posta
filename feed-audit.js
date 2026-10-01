// feed-audit.js — Auditoría IA del feed público de Instagram (lead magnet).
//
// Página pública /auditoria: el visitante escribe su @ → Posty analiza su
// feed público (bio, últimos posteos, captions, frecuencia, paleta) y devuelve
// un reporte con score, dimensiones y arreglos concretos con evidencia.
// El CTA lleva a /prueba?ig=@handle con el handle pre-rellenado.
//
// Contrato: NUNCA lanza. auditFeed devuelve {ok:true, audit, cached} o
// {ok:false, error}. Todo best-effort: si un dato no está disponible, la
// dimensión se marca "sin datos" en vez de inventarse.
//
// Exporta: { auditFeed, getCachedAudit, consumeAuditAttempt, refundAuditAttempt,
//   sanitizeHandle, computeSignals, buildAuditPrompt, validateAudit, CLICHES }
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('./db');
const demo = require('./demo');

const AUDIT_MODEL = 'gpt-4o-mini';
const AUDIT_CACHE_HOURS = 72;
const AUDIT_LIMIT_PER_DAY = 5; // auditorías por día por IP
const MAX_POSTS = 12;
const MAX_THUMBS = 4;

// ---------------------------------------------------------------------------
// Tablas (idempotentes)
// ---------------------------------------------------------------------------
try { db.exec(`CREATE TABLE IF NOT EXISTS audit_cache (
  handle TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL
)`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS audit_usage (
  ip TEXT, day TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (ip, day)
)`); } catch (e) {}

// ---------------------------------------------------------------------------
// Anti-spam honesto: 5 auditorías por día por IP (mismo patrón que /prueba).
// Se RESERVA al arrancar y se REEMBOLSA si falla.
// ---------------------------------------------------------------------------
function auditDayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function consumeAuditAttempt(ip) {
  const day = auditDayStr();
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM audit_usage WHERE day < date('now', '-7 days')`);
  } catch (_) {}
  try {
    const info = db.prepare(
      `INSERT INTO audit_usage (ip, day, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, day) DO UPDATE SET count = count + 1 WHERE count < ?`
    ).run(ip, day, AUDIT_LIMIT_PER_DAY);
    if (!info || info.changes < 1) return { ok: false, remaining: 0 };
    const row = db.prepare('SELECT count FROM audit_usage WHERE ip = ? AND day = ?').get(ip, day);
    const c = row ? row.count : 1;
    return { ok: true, remaining: Math.max(0, AUDIT_LIMIT_PER_DAY - c) };
  } catch (e) { return { ok: true, remaining: AUDIT_LIMIT_PER_DAY }; }
}
function refundAuditAttempt(ip) {
  try {
    db.prepare(`UPDATE audit_usage SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
      WHERE ip = ? AND day = ?`).run(ip, auditDayStr());
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Sanitización del handle (misma que /api/trial/generate)
// ---------------------------------------------------------------------------
function sanitizeHandle(h) {
  return String(h || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 40);
}

// ---------------------------------------------------------------------------
// Parseo de posteos desde el HTML del embed público.
// Devuelve [{type, shortcode, taken_at, caption, comments, thumb}]
// ---------------------------------------------------------------------------
function decodeCaption(raw) {
  // El archivo trae el caption con doble escape: \" para comillas, \\uXXXX y
  // \\n literales (2 backslashes). Se baja un nivel y se decodifica.
  let s = String(raw || '')
    .replace(/\\"/g, '"')    // \" -> "
    .replace(/\\\\/g, '\\'); // \\ -> \
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
    try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; }
  });
  s = s.replace(/\\n|\\r|\\t/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 600);
}

function parseEmbedPosts(html) {
  const posts = [];
  try {
    const BS = String.fromCharCode(92);
    const Q = BS + '"'; // en el archivo: \" (backslash + comilla)
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\{' + esc(Q) + '__typename' + esc(Q) + ':' + esc(Q) +
      '(GraphImage|GraphVideo|GraphSidecar)' + esc(Q), 'g');
    let m;
    while ((m = re.exec(html)) && posts.length < MAX_POSTS) {
      const segRaw = html.slice(m.index, m.index + 9000);
      const seg = segRaw.split(Q).join('"'); // un nivel de escape menos
      const f = (rx) => { const mm = rx.exec(seg); return mm ? mm[1] : null; };
      // El caption se captura del segmento CRUDO (con \" intactos) y lo
      // decodifica decodeCaption en sus dos niveles.
      const fRaw = (rx) => { const mm = rx.exec(segRaw); return mm ? mm[1] : null; };
      const qe = '\\\\"'; // en regex: casa con \" del archivo
      const capRaw = fRaw(new RegExp(qe + 'text' + qe + ':' + qe + '((?:[^"\\\\]|\\\\.){0,500})'));
      const thumbRaw = f(/"display_url":"((?:[^"\\]|\\.){0,600})/);
      posts.push({
        type: m[1],
        shortcode: f(/"shortcode":"([A-Za-z0-9_-]+)"/),
        taken_at: f(/"taken_at_timestamp":(\d+)/) ? parseInt(f(/"taken_at_timestamp":(\d+)/), 10) : null,
        caption: decodeCaption(capRaw || ''),
        comments: f(/"edge_media_to_comment":\{"count":(\d+)/) ? parseInt(f(/"edge_media_to_comment":\{"count":(\d+)/), 10) : null,
        thumb: thumbRaw ? thumbRaw.replace(/\\\//g, '/') : null,
      });
    }
  } catch (_) {}
  return posts;
}

// ---------------------------------------------------------------------------
// Datos públicos del perfil + posteos (best-effort)
// ---------------------------------------------------------------------------
async function fetchAuditData(handle, fetchOverride) {
  const ig = sanitizeHandle(handle);
  if (!ig) return { ok: false, error: 'Pasame tu @ de Instagram' };
  let html = null;
  try {
    html = fetchOverride ? await fetchOverride(ig) : await demo.fetchIgEmbedHtml(ig);
  } catch (e) { html = null; }
  if (!html) return { ok: false, error: 'No encontramos ese Instagram (puede ser privado o no existir)' };
  const bio = demo.extractIgBiography(html) || '';
  const seg = html.split(String.fromCharCode(92) + '"').join('"');
  const f = (rx) => { const m = rx.exec(seg); return m ? m[1] : null; };
  const posts = parseEmbedPosts(html);
  // Foto de perfil (best-effort, para mostrar en el reporte)
  let pic = null, fullName = '';
  try {
    const prof = await demo.fetchIgProfile(ig);
    if (prof) { pic = prof.pic || null; fullName = prof.name || ''; }
  } catch (_) {}
  return {
    ok: true,
    profile: {
      handle: ig,
      name: fullName,
      bio,
      followers: f(/"followers_count":(\d+)/) ? parseInt(f(/"followers_count":(\d+)/), 10) : null,
      posts_count: f(/"posts_count":(\d+)/) ? parseInt(f(/"posts_count":(\d+)/), 10) : null,
      category: demo.categoryFromText(bio + ' ' + fullName),
      pic,
    },
    posts,
  };
}

// ---------------------------------------------------------------------------
// Señales heurísticas (números concretos que el LLM debe citar como evidencia)
// ---------------------------------------------------------------------------
const CTA_RE = /escribime|escribinos|whatsapp|wsp|link en (la )?bio|comentá|comenta|reservá|reservá tu|reserva tu|turno|escribime por|por dm|mensaje directo|visitanos|visítanos|te esperamos|pedidos|pedí|pedi tu|hacé tu pedido/i;
const HASHTAG_RE = /#[\p{L}0-9_]+/u;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

function computeSignals(profile, posts) {
  const withTs = posts.filter((p) => p.taken_at);
  let postsPerWeek = null, daysSpan = null;
  if (withTs.length >= 2) {
    const ts = withTs.map((p) => p.taken_at).sort((a, b) => a - b);
    daysSpan = Math.max(1, Math.round((ts[ts.length - 1] - ts[0]) / 86400));
    postsPerWeek = +(withTs.length / (daysSpan / 7)).toFixed(1);
  }
  const caps = posts.map((p) => p.caption || '');
  const nonEmpty = caps.filter((c) => c.trim().length > 0);
  const words = nonEmpty.map((c) => c.split(/\s+/).filter(Boolean).length);
  const avgLen = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0;
  const pct = (re) => caps.length ? Math.round((caps.filter((c) => re.test(c)).length / caps.length) * 100) : 0;
  const hashtagCounts = caps.map((c) => (c.match(/#[\p{L}0-9_]+/gu) || []).length);
  const avgHashtags = caps.length ? +(hashtagCounts.reduce((a, b) => a + b, 0) / caps.length).toFixed(1) : 0;
  const types = { GraphImage: 0, GraphVideo: 0, GraphSidecar: 0 };
  posts.forEach((p) => { if (types[p.type] !== undefined) types[p.type]++; });
  return {
    n_posts: posts.length,
    days_span: daysSpan,
    posts_per_week: postsPerWeek,
    captions_with_text_pct: caps.length ? Math.round((nonEmpty.length / caps.length) * 100) : 0,
    avg_caption_words: avgLen,
    cta_pct: pct(CTA_RE),
    hashtag_pct: pct(HASHTAG_RE),
    avg_hashtags: avgHashtags,
    emoji_pct: pct(EMOJI_RE),
    videos: types.GraphVideo,
    images: types.GraphImage,
    carousels: types.GraphSidecar,
    bio_length: (profile.bio || '').length,
    bio_has_what: /(vendemos|vendo|hacemos|hago|servicio|productos|turnos|env[ií]os|delivery|tienda)/i.test(profile.bio || ''),
    followers: profile.followers,
    total_posts: profile.posts_count,
    palette_hues: null, // se completa con análisis de thumbnails (best-effort)
  };
}

// ---------------------------------------------------------------------------
// Paleta: baja hasta 4 thumbnails, extrae colores y cuenta "paletas distintas"
// (buckets de tono). Best-effort: si falla, palette_hues queda null.
// ---------------------------------------------------------------------------
function hexToHueBucket(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 0.12) return -1; // gris: no cuenta
  let h = 0;
  const d = mx - mn;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60); if (h < 0) h += 360;
  return Math.floor(h / 40); // 9 buckets
}

async function downloadThumb(url, timeoutMs = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PostaBot/1.0)' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 2 * 1024 * 1024) return null;
    return buf;
  } catch (_) { return null; } finally { clearTimeout(t); }
}

function extractColors(buf) {
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `audit-thumb-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`);
    try { fs.writeFileSync(tmp, buf); } catch (_) { return resolve([]); }
    execFile('python3', [path.join(__dirname, 'extract_colors.py'), tmp], { timeout: 8000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return resolve([]);
      resolve(String(stdout || '').trim().split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c)));
    });
  });
}

async function analyzePalette(posts) {
  try {
    const thumbs = posts.map((p) => p.thumb).filter(Boolean).slice(0, MAX_THUMBS);
    if (!thumbs.length) return null;
    const bufs = await Promise.all(thumbs.map((u) => downloadThumb(u)));
    const hues = new Set();
    for (const buf of bufs) {
      if (!buf) continue;
      const cols = await extractColors(buf);
      cols.forEach((c) => { const b = hexToHueBucket(c); if (b >= 0) hues.add(b); });
    }
    return hues.size || null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// Prompt para gpt-4o-mini (con checklist ANTI-GENERICO)
// ---------------------------------------------------------------------------
const CLICHES = [
  'publicá más seguido', 'publica mas seguido', 'publicar más seguido',
  'mejorá tus fotos', 'mejora tus fotos', 'mejorar tus fotos',
  'sé constante', 'se constante', 'sé consistente',
  'contenido de calidad', 'generá contenido de valor', 'genera contenido de valor',
  'interactuá con tu audiencia', 'interactua con tu audiencia',
  'usá hashtags relevantes', 'usa hashtags relevantes',
  'conocé a tu audiencia', 'conoce a tu audiencia',
  'contenido auténtico', 'sé auténtico', 'se autentico',
];

function buildAuditPrompt(profile, signals, captions) {
  const capLines = captions.slice(0, 10).map((c, i) => `${i + 1}. "${c.slice(0, 160)}"`).join('\n');
  return {
    system: [
      'Sos Posty, auditor de Instagram para negocios. Analizás DATOS REALES de un perfil público y devolvés SOLO JSON válido (sin markdown, sin explicaciones).',
      'REGLA DE ORO ANTI-GENÉRICA: cada hallazgo debe citar un dato concreto de los que te paso (números, ejemplos textuales). PROHIBIDO decir "publicá más seguido", "mejorá tus fotos", "sé constante", "contenido de calidad" o cualquier consejo que serviría para cualquier cuenta.',
      'Si un dato no está disponible (null), no inventes: esa dimensión lleva score null y line "Sin datos suficientes".',
      'Tono: rioplatense, directo, con onda. Como un amigo que sabe de Instagram.',
      'Formato JSON exacto:',
      '{ "score": 0-100, "summary": "2 líneas máx",',
      '  "dimensions": [ {"key":"bio","label":"Bio","score":0-100|null,"line":"1 línea con dato concreto"}, {"key":"consistencia","label":"Consistencia visual",...}, {"key":"captions","label":"Captions que venden",...}, {"key":"frecuencia","label":"Frecuencia",...}, {"key":"marca","label":"Marca y confianza",...} ],',
      '  "fixes": [ {"title":"corto","evidence":"dato concreto CON NÚMERO o cita textual","fix":"qué hacer, concreto y accionable","example":"ejemplo reescrito para SU negocio"} ] (3 a 5, priorizados: lo que más impacto tiene primero),',
      '  "wins": ["1-2 cosas que ya hacen bien, con dato concreto"] }',
      'Calibración: 90+ excelente, 70-89 bien, 50-69 necesita trabajo, menos de 50 urgente.',
    ].join('\n'),
    user: [
      `Perfil: @${profile.handle}${profile.name ? ` (${profile.name})` : ''}`,
      `Bio (${signals.bio_length} caracteres): "${(profile.bio || '(vacía)').slice(0, 300)}"`,
      `Seguidores: ${profile.followers ?? 'desconocido'} · Posteos totales: ${profile.total_posts ?? 'desconocido'}`,
      `Rubro detectado: ${profile.category || 'otro'}`,
      '',
      'SEÑALES (últimos posteos analizados: ' + signals.n_posts + '):',
      `- Frecuencia: ${signals.posts_per_week ?? 'sin datos'} posteos/semana (en ${signals.days_span ?? '?'} días)`,
      `- Mix: ${signals.videos} videos, ${signals.images} imágenes, ${signals.carousels} carruseles`,
      `- Captions con texto: ${signals.captions_with_text_pct}% · largo promedio: ${signals.avg_caption_words} palabras`,
      `- Con CTA concreto: ${signals.cta_pct}% · con hashtags: ${signals.hashtag_pct}% (promedio ${signals.avg_hashtags} por posteo) · con emojis: ${signals.emoji_pct}%`,
      `- Paletas de color distintas en el feed: ${signals.palette_hues ?? 'sin datos'}`,
      `- La bio dice qué venden: ${signals.bio_has_what ? 'sí' : 'no'}`,
      '',
      'Últimos captions:',
      capLines || '(sin captions)',
    ].join('\n'),
  };
}

function callAuditLlm(prompt, llmOverride) {
  if (llmOverride) return llmOverride(prompt);
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) return Promise.resolve({ ok: false, error: 'no_api_key' });
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: AUDIT_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(45000),
  }).then(async (res) => {
    if (!res.ok) return { ok: false, error: 'llm_' + res.status };
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return text ? { ok: true, text } : { ok: false, error: 'llm_empty' };
  }).catch(() => ({ ok: false, error: 'llm_error' }));
}

function containsCliche(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return CLICHES.some((c) => t.includes(c.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

function stripFences(s) {
  return String(s || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// ---------------------------------------------------------------------------
// Validación del JSON del LLM: estructura + evidencia concreta + sin clichés
// ---------------------------------------------------------------------------
function validateAudit(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not_object'] };
  const score = obj.score;
  if (!Number.isInteger(score) || score < 0 || score > 100) errors.push('bad_score');
  const dims = obj.dimensions;
  const KEYS = ['bio', 'consistencia', 'captions', 'frecuencia', 'marca'];
  if (!Array.isArray(dims) || dims.length !== 5) errors.push('bad_dimensions');
  else dims.forEach((d, i) => {
    if (!d || d.key !== KEYS[i]) errors.push('bad_dimension_key_' + i);
    if (!(d.score === null || (Number.isInteger(d.score) && d.score >= 0 && d.score <= 100))) errors.push('bad_dimension_score_' + i);
    if (!d.line || String(d.line).length < 10) errors.push('bad_dimension_line_' + i);
  });
  const fixes = obj.fixes;
  if (!Array.isArray(fixes) || fixes.length < 3 || fixes.length > 5) errors.push('bad_fixes_count');
  else fixes.forEach((fx, i) => {
    if (!fx.title || !fx.evidence || !fx.fix) errors.push('bad_fix_' + i);
    // La evidencia tiene que ser concreta: número o cita
    if (fx.evidence && !/\d/.test(String(fx.evidence)) && !/"/.test(String(fx.evidence))) errors.push('fix_no_evidence_' + i);
  });
  const wins = obj.wins;
  if (!Array.isArray(wins) || wins.length < 1 || wins.length > 2) errors.push('bad_wins');
  if (!obj.summary || String(obj.summary).length < 10) errors.push('bad_summary');
  if (containsCliche(JSON.stringify(obj))) errors.push('cliche_detected');
  if (errors.length) return { ok: false, errors };
  return { ok: true, audit: obj };
}

// ---------------------------------------------------------------------------
// Cache 72h por handle
// ---------------------------------------------------------------------------
function getCachedAudit(handle) {
  const ig = sanitizeHandle(handle);
  if (!ig) return null;
  try {
    const hit = db.prepare('SELECT payload, created_at FROM audit_cache WHERE handle = ?').get(ig);
    if (hit && Date.now() - hit.created_at < AUDIT_CACHE_HOURS * 3600 * 1000) {
      const audit = JSON.parse(hit.payload);
      return { audit, cached: true };
    }
    if (hit) db.prepare('DELETE FROM audit_cache WHERE handle = ?').run(ig);
    if (Math.random() < 0.05) db.exec(`DELETE FROM audit_cache WHERE created_at < ${Date.now() - AUDIT_CACHE_HOURS * 3600 * 1000}`);
  } catch (_) {}
  return null;
}

function saveAuditCache(handle, audit) {
  try {
    db.prepare(`INSERT INTO audit_cache (handle, payload, created_at) VALUES (?, ?, ?)
      ON CONFLICT(handle) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`)
      .run(sanitizeHandle(handle), JSON.stringify(audit), Date.now());
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Orquestador principal. opts: { fetch, llm } para inyección en tests.
// ---------------------------------------------------------------------------
async function auditFeed(dbArg, handle, opts = {}) {
  const ig = sanitizeHandle(handle);
  if (!ig) return { ok: false, error: 'Pasame tu @ de Instagram' };
  const cached = getCachedAudit(ig);
  if (cached) return { ok: true, audit: cached.audit, cached: true };

  const data = await fetchAuditData(ig, opts.fetch);
  if (!data.ok) return { ok: false, error: data.error };
  if (!data.posts.length) return { ok: false, error: 'Ese Instagram no tiene posteos públicos para analizar' };

  const signals = computeSignals(data.profile, data.posts);
  try {
    signals.palette_hues = opts.palette !== undefined ? opts.palette : await analyzePalette(data.posts);
  } catch (_) { signals.palette_hues = null; }

  const prompt = buildAuditPrompt(data.profile, signals, data.posts.map((p) => p.caption).filter(Boolean));

  // Hasta 2 intentos: si el JSON es inválido o tiene clichés, se reintenta
  // con una instrucción más dura.
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt : {
      system: prompt.system + '\n\nTU RESPUESTA ANTERIOR FUE RECHAZADA (' + lastErr + '). Esta vez CADA fix debe citar un número o cita textual concreta en "evidence", y está TERMINANTEMENTE PROHIBIDO cualquier consejo genérico.',
      user: prompt.user,
    };
    const r = await callAuditLlm(p, opts.llm);
    if (!r.ok) { lastErr = r.error; continue; }
    let obj = null;
    try { obj = JSON.parse(stripFences(r.text)); } catch (e) { lastErr = 'bad_json'; continue; }
    const v = validateAudit(obj);
    if (v.ok) {
      const audit = Object.assign({}, v.audit, {
        handle: ig,
        name: data.profile.name || '',
        followers: data.profile.followers,
        pic: data.profile.pic || null,
        audited_at: Date.now(),
      });
      saveAuditCache(ig, audit);
      return { ok: true, audit, cached: false };
    }
    lastErr = v.errors.join(',');
  }
  return { ok: false, error: 'No pudimos analizar ese Instagram ahora. Probá de nuevo en unos minutos.' };
}

module.exports = {
  auditFeed,
  getCachedAudit,
  consumeAuditAttempt,
  refundAuditAttempt,
  sanitizeHandle,
  computeSignals,
  buildAuditPrompt,
  validateAudit,
  containsCliche,
  CLICHES,
  parseEmbedPosts,
  AUDIT_LIMIT_PER_DAY,
};
