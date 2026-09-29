// Posta — servidor principal
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const { generateContent, generateCaptions, generateIdeas, chatIdea, suggestReply, performanceBrief, bestHoursLine, generatePillars, voiceExamples } = require('./generator');
const { upcomingEphemeris } = require('./ephemeris');
const creator = require('./creator.js');
const { getAuthUrl, exchangeCodeForTokens, getIgUsername, getIgProfile } = require('./instagram');
const { startScheduler, publishSinglePost } = require('./scheduler');
const { reconcileUser } = require('./billing-sync');
const { startTokenRefresh } = require('./tokenrefresh');
const { renderVideo, ffmpegAvailable } = require('./video');
const { PLANS, TRIAL_PLAN, getPlan, getPlans, formatPrice, PLAN_ANCHOR } = require('./config/plans');
const TRIAL_DAYS = 3;
const mp = require('./mercadopago');
const demo = require('./demo');
const { sendEmail } = require('./email');
const os = require('os');
const streaks = require('./streaks');
const metaAds = require('./meta_ads');
const { AD_FEE_PCT, AD_MIN_TOPUP_CENTS, AD_TOPUP_OPTIONS, AD_BUDGET_OPTIONS, AD_MIN_BUDGET_CENTS, AD_DEFAULT_DAYS, adSplit, fmtARS } = require('./config/ads');

// Funnel: eventos de conversión (prueba → registro → conexión → semana → pago).
// Tabla funnel_events (db.js). Sin PII: solo user_id + evento.
function track(userId, event, meta = '') {
  try {
    db.prepare('INSERT INTO funnel_events (user_id, event, meta) VALUES (?,?,?)')
      .run(userId || null, event, String(meta || '').slice(0, 200));
  } catch (e) { /* el tracking nunca bloquea */ }
}

// Corta un texto SIN partir palabras a la mitad (nunca "efecti").
function cortar(t, max) {
  const s = String(t || '').trim();
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  const i = c.lastIndexOf(' ');
  return (i > max * 0.4 ? c.slice(0, i) : c).trim();
}
const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
// Los archivos subidos (diseños, fotos, logos) van al volumen persistente (DATA_DIR),
// no al repo: Railway borra el filesystem en cada deploy y los posteos quedarían rotos.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(DATA_DIR, 'media');
const IMAGE_BASE_URL = (process.env.IMAGE_BASE_URL || '').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const SESSION_SECRET = process.env.SESSION_SECRET;
if (IS_PROD && !SESSION_SECRET) {
  console.error('[posta] ❌ ERROR: en producción tenés que definir SESSION_SECRET en las variables de entorno.');
  process.exit(1);
}
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

app.use(express.json({ limit: '15mb' }));

// Sesiones persistentes en SQLite: cada deploy reinicia el servidor y la memoria
// se pierde; sin este store cada deploy deslogueaba a todos los usuarios.
class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    )`);
    const sweep = setInterval(() => {
      try { db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now()); } catch (e) {}
    }, 3600 * 1000);
    if (sweep.unref) sweep.unref();
  }
  get(sid, cb) {
    try {
      const row = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expire <= Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 7 * 24 * 3600 * 1000;
      db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), Date.now() + maxAge);
      cb(null);
    } catch (e) { cb(e); }
  }
  destroy(sid, cb) {
    try { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); cb(null); } catch (e) { cb(e); }
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}
app.use(
  session({
    store: new SqliteSessionStore(),
    secret: SESSION_SECRET || 'posta-dev-secret-cambiar-en-prod',
    resave: false,
    saveUninitialized: false,
    rolling: true, // cada request renueva la expiración: mientras uses Posta, nunca se cierra
    cookie: { maxAge: 365 * 24 * 3600 * 1000, httpOnly: true, secure: process.env.COOKIE_SECURE === '1' },
  })
);
app.use('/media', express.static(MEDIA_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, fp) => { if (/\.(js|css|html)$/.test(fp)) res.setHeader('Cache-Control', 'no-cache'); },
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
};

// Si la prueba gratis venció, no se puede generar ni programar: el paywall es "Mi plan"
function requireTrialValid(req, res, next) {
  try {
    const u = db.prepare('SELECT plan_status, trial_ends_at FROM users WHERE id = ?').get(req.session.userId);
    if (u && u.plan_status === 'trial' && u.trial_ends_at && u.trial_ends_at <= Date.now())
      return res.status(402).json({ error: 'trial_expired', message: 'Tu prueba gratis terminó. Elegí un plan para seguir creando contenido.' });
  } catch (e) { /* ante la duda, dejar pasar */ }
  next();
}

function getProfile(userId) {
  let p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!p) {
    db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(userId);
    p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  }
  return p;
}
function getSettings(userId) {
  let s = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  if (!s) {
    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(userId);
    s = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  }
  return s;
}
// ADN del negocio (dna_json): lectura/escritura con merge (nunca pisar campos como series o pausas).
function readDna(userId) {
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    if (r && r.dna_json) { const o = JSON.parse(r.dna_json); return (o && typeof o === 'object') ? o : {}; }
  } catch (e) {}
  return {};
}
function writeDna(userId, obj) {
  db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET dna_json=excluded.dna_json, updated_at=datetime('now')`).run(userId, JSON.stringify(obj || {}));
}
// Tipos de contenido válidos + mapeo de palabras del cliente a tipos.
const TIPOS_VALIDOS = ['promo', 'tip', 'social', 'detras', 'novedad'];
const TIPO_PLURAL = { promo: 'promos', tip: 'tips', social: 'posteos de prueba social', detras: 'posteos de detrás de escena', novedad: 'novedades' };
function palabraATipo(w) {
  const s = String(w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^promos?$/.test(s)) return 'promo';
  if (/^tips?$/.test(s)) return 'tip';
  if (/^(posteo|contenido)s?$/.test(s)) return null;
  if (/social|testimonios?|resenas?|clientes/.test(s)) return 'social';
  if (/detras|bts|equipo|cocina|taller/.test(s)) return 'detras';
  if (/novedad|novedades|nuevo|nuevos/.test(s)) return 'novedad';
  return null;
}
// Tipos pausados por el cliente (expiran a los 30 días).
function pausedTipos(userId) {
  const dna = readDna(userId);
  const pt = (dna && typeof dna.paused_tipos === 'object' && dna.paused_tipos) || {};
  const out = {};
  const now = Date.now();
  for (const t of TIPOS_VALIDOS) {
    if (pt[t] && (now - pt[t]) < 30 * 86400000) out[t] = true;
  }
  return out;
}
function setPausedTipo(userId, tipo, paused) {
  if (!TIPOS_VALIDOS.includes(tipo)) return false;
  const dna = readDna(userId);
  const pt = (dna && typeof dna.paused_tipos === 'object' && dna.paused_tipos) || {};
  if (paused) pt[tipo] = Date.now();
  else delete pt[tipo];
  dna.paused_tipos = pt;
  writeDna(userId, dna);
  return true;
}
// Transcribe un data URL de audio con Whisper. Devuelve el texto o lanza.
async function transcribeAudio(dataUrl, apiKey) {
  const m = String(dataUrl).match(/^data:(audio\/[\w+.-]+);base64,(.+)$/);
  if (!m) throw new Error('audio inválido');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 12 * 1024 * 1024) throw new Error('audio inválido');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: m[1] }), 'audio.webm');
  form.append('model', 'whisper-1');
  form.append('language', 'es');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) throw new Error(`whisper ${r.status}`);
  const j = await r.json();
  return String((j && j.text) || '').trim();
}
function maskSettings(s) {
  const c = { ...s };
  if (c.openai_key) c.openai_key = '••••••' + c.openai_key.slice(-4);
  if (c.pexels_key) c.pexels_key = '••••••' + c.pexels_key.slice(-4);
  if (c.ig_access_token) c.ig_access_token = '••••••' + c.ig_access_token.slice(-4);
  if (c.meta_app_secret) c.meta_app_secret = '••••••';
  return c;
}

// ---------- Auth ----------
// Importa la semana generada en /prueba a la cuenta nueva: los posteos quedan
// como borradores (nada se publica sin su OK). Lee del trial_cache por @,
// así no se re-suben los archivos desde el navegador.
function importTrialWeek(userId, igRaw) {
  const ig = String(igRaw || '').trim().replace(/^@/, '').toLowerCase();
  if (!ig) return 0;
  const hit = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(ig);
  if (!hit) return 0;
  let out;
  try { out = JSON.parse(hit.payload); } catch (e) { return 0; }
  const posts = (out.posts || []).filter((p) => p && (p.image || p.video));
  if (!posts.length) return 0;
  if (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(userId).c) return 0;
  let n = 0;
  for (const p of posts.slice(0, 7)) {
    try {
      const isVideo = p.type === 'video' && p.video;
      const m = /^data:(image\/(png|jpeg|webp)|video\/mp4);base64,([\s\S]+)$/.exec(String(isVideo ? p.video : p.image || ''));
      if (!m) continue;
      const ext = m[1] === 'video/mp4' ? 'mp4' : (m[2] === 'jpeg' ? 'jpg' : m[2]);
      const buf = Buffer.from(m[3], 'base64');
      if (!buf.length || buf.length > 15 * 1024 * 1024) continue;
      const name = `trial-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
      db.prepare(
        'INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type) VALUES (?,?,?,?,?,?)'
      ).run(userId, `/media/${name}`, String(p.caption || ''), String(p.hashtags || ''), 'draft', isVideo ? 'video' : 'image');
      n++;
    } catch (e) { /* un posteo fallido no frena los demás */ }
  }
  return n;
}

// La semana importada de /prueba cuenta como 1ra semana de racha:
// el usuario nuevo arranca con su 🌱 desde el día uno.
function streakFromTrialImport(userId, nImp) {
  if (!nImp) return;
  try {
    const tz = userTz(userId);
    streaks.recordWeekArmed(db, userId, streaks.mondayKeyOf(streaks.tzToday(tz)));
  } catch (e) { console.error('[posta] streak trial:', e.message); }
}

app.post('/api/auth/register', (req, res) => {
  const { email, password, ref, trial_ig } = req.body || {};
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: 'Email y contraseña (mínimo 6 caracteres)' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const code = newReferralCode();
    let referredBy = null;
    const refCode = String(ref || '').trim().toLowerCase().slice(0, 16);
    if (/^[a-z0-9]{4,16}$/.test(refCode)) {
      const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(refCode);
      if (referrer && referrer.id) referredBy = referrer.id;
    }
    const trialEnds = Date.now() + TRIAL_DAYS * 24 * 3600 * 1000;
    const r = db.prepare('INSERT INTO users (email, password_hash, referral_code, referred_by, trial_ends_at) VALUES (?, ?, ?, ?, ?)').run(email.trim().toLowerCase(), hash, code, referredBy, trialEnds);
    req.session.userId = r.lastInsertRowid;
    // Si viene de /prueba con el mismo @, su semana generada lo espera adentro como borradores
    try {
      const nImp = importTrialWeek(r.lastInsertRowid, trial_ig);
      if (nImp) console.log(`[posta] semana de prueba importada: ${nImp} borradores → usuario ${r.lastInsertRowid}`);
      streakFromTrialImport(r.lastInsertRowid, nImp);
    } catch (e) { console.error('[posta] importTrialWeek:', e.message); }
    track(r.lastInsertRowid, 'registered');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Ese email ya está registrado' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, trial_ig } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  req.session.userId = user.id;
  // Si viene de /prueba y ya tenía cuenta, su semana también lo espera adentro
  try {
    const nImp = importTrialWeek(user.id, trial_ig);
    if (nImp) console.log(`[posta] semana de prueba importada (login): ${nImp} borradores → usuario ${user.id}`);
    streakFromTrialImport(user.id, nImp);
  } catch (e) { console.error('[posta] importTrialWeek:', e.message); }
  res.json({ ok: true });
});

// ---------- Onboarding conversacional ----------
// La IA entrevista al dueño por chat y extrae el perfil del negocio.
// El frontend manda el historial; el backend devuelve la próxima intervención.
const OB_STEPS = [
  { key: 'nombre', pregunta: '¿Cómo se llama tu negocio? 🏪' },
  { key: 'vende', pregunta: '¿Qué vendés? Contame con tus palabras, sin vueltas.' },
  { key: 'cliente', pregunta: '¿A quién le vendés? ¿Quién es tu cliente ideal?' },
  { key: 'distinto', pregunta: '¿Qué te hace distinto de otros que venden lo mismo?' },
  { key: 'instagram', pregunta: '¿Cuál es tu Instagram? O pasame el de un competidor que te guste para chusmear el estilo. Si no tenés, decime "saltear".' },
  { key: 'logo', pregunta: 'Subí tu logo y saco tus colores de ahí 🎨. Si no lo tenés a mano, decime "saltear".' },
  { key: 'objetivo', pregunta: '¿Cuál es tu objetivo principal con Instagram?' },
];
const OB_GOAL_CHIPS = ['Vender más', 'Conseguir seguidores', 'Llenar mi local', 'Contar novedades'];
const OB_GREETING = '¡Hola! Soy tu community manager 🙌 Te hago unas preguntas rápidas para conocer tu negocio a fondo y armarte todo. Son 7, dale que va:';

app.post('/api/onboarding/chat', requireAuth, async (req, res) => {
  try {
    const history = Array.isArray(req.body.history)
      ? req.body.history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(-20)
      : [];
    const userCount = history.filter(m => m.role === 'user').length;
    if (userCount >= OB_STEPS.length) return res.json({ ok: true, done: true, answered: userCount });
    const step = OB_STEPS[userCount];
    let reply;
    if (!history.length) {
      reply = `${OB_GREETING} ${step.pregunta}`;
    } else {
      const lastUser = [...history].reverse().find(m => m.role === 'user') || { text: '' };
      const apiKey = (getSettings(req.session.userId).openai_key) || process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        reply = `¡Buenísimo! ${step.pregunta}`;
      } else {
        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: `Sos el community manager de Posta entrevistando al dueño de un negocio para conocerlo a fondo. Ya van ${userCount} de ${OB_STEPS.length} preguntas. El dueño acaba de responder: "${(lastUser.text || '').slice(0, 300)}". Escribí 1-2 líneas en español rioplatense con voseo: primero un acuse cálido y ESPECÍFICO de lo que dijo (nada genérico), y después hacé la siguiente pregunta: "${step.pregunta}". Si su respuesta fue evasiva ("no sé", "saltear", vacía o de una palabra), no insistas: pasá a la siguiente con buena onda. Nunca hagas más de una pregunta.` },
              ],
              max_tokens: 220, temperature: 0.8,
            }),
            signal: AbortSignal.timeout(20000),
          });
          const j = await r.json();
          const txt = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
          reply = cortar(txt, 500) || `¡Buenísimo! ${step.pregunta}`;
        } catch (e) { reply = `¡Buenísimo! ${step.pregunta}`; }
      }
    }
    res.json({
      ok: true, done: false, reply, answered: userCount,
      chips: step.key === 'objetivo' ? OB_GOAL_CHIPS : null,
      awaitLogo: step.key === 'logo',
    });
  } catch (e) {
    console.error('[onboarding/chat]', e.message);
    res.json({ ok: false, error: 'No pudimos continuar' });
  }
});

app.post('/api/onboarding/finish', requireAuth, async (req, res) => {
  try {
    const history = Array.isArray(req.body.history) ? req.body.history.filter(m => m && m.role === 'user' && m.text) : [];
    const apiKey = (getSettings(req.session.userId).openai_key) || process.env.OPENAI_API_KEY || '';
    const qa = history.map((m, i) => `P${i + 1}: ${m.q || ''}\nR: ${m.text}`).join('\n');
    let profile = { business_name: '', category: 'otro', description: '', audience: '', differentiator: '', instagram: '', goal: '' };
    let summary = '';
    if (apiKey && qa) {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'Analizás la entrevista a un dueño de negocio y devolvés SOLO JSON: {"business_name":"...","category":"...","description":"...","audience":"...","differentiator":"...","instagram":"...","goal":"...","summary":"..."}. Reglas: category = la más cercana de [ropa, gastronomia, cafeteria, belleza, barberia, fitness, salud, mascotas, servicios, educacion, tecnologia, hogar, inmobiliaria, eventos, viajes, arte, otro]. description = 1-2 frases que resuman qué vende y para quién, con sus palabras. goal = una de [vender, seguidores, local, novedades] según lo que dijo (o vacío). summary = 2-3 líneas cálidas en español rioplatense con voseo, contándole lo que entendiste de su negocio, como un community manager que lo escuchó de verdad. Si un dato no está, dejalo vacío. Nada de texto fuera del JSON.' },
              { role: 'user', content: qa.slice(0, 3000) },
            ],
            max_tokens: 600, temperature: 0.5,
          }),
          signal: AbortSignal.timeout(25000),
        });
        const j = await r.json();
        const txt = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
        const mm = txt.match(/\{[\s\S]*\}/);
        if (mm) {
          const p = JSON.parse(mm[0]);
          for (const k of Object.keys(profile)) if (typeof p[k] === 'string') profile[k] = p[k].slice(0, 600);
          if (typeof p.summary === 'string') summary = p.summary.slice(0, 600);
        }
      } catch (e) { console.error('[onboarding/extract]', e.message); }
    }
    if (!profile.business_name && history[0] && history[0].text) profile.business_name = cortar(history[0].text, 80);
    if (!summary) summary = profile.business_name ? `¡Listo! Ya conozco a ${profile.business_name} 🙌` : '¡Listo! Ya te conozco un poco más 🙌';
    res.json({ ok: true, profile, summary });
  } catch (e) {
    console.error('[onboarding/finish]', e.message);
    res.json({ ok: false, error: 'No pudimos cerrar la entrevista' });
  }
});

// ---------- PWA instalada ----------
// El frontend avisa cuando el usuario instala la app en el teléfono.
// Sirve para no mandarle emails semanales a quien ya la tiene instalada.
app.post('/api/pwa-installed', requireAuth, (req, res) => {
  db.prepare(`UPDATE users SET pwa_installed = 1 WHERE id = ?`).run(req.session.userId);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, created_at, plan, plan_status, mp_preapproval_id, mp_payer_email, trial_ends_at, email_verified FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json({ user: null });
  const plan = getPlan(user.plan_status === 'active' ? user.plan : TRIAL_PLAN);
  const nowMs = Date.now();
  const tEnds = user.trial_ends_at || 0;
  const trialExpired = user.plan_status === 'trial' && tEnds > 0 && tEnds <= nowMs;
  const trialDaysLeft = (!trialExpired && tEnds > nowMs) ? Math.ceil((tEnds - nowMs) / 86400000) : 0;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      email_verified: !!user.email_verified,
      mp_payer_email: user.mp_payer_email || '',
      created_at: user.created_at,
      plan: user.plan || TRIAL_PLAN,
      plan_status: user.plan_status || 'trial',
      posts_per_week: plan.postsPerWeek,
      is_trial: user.plan_status !== 'active',
      trial_days_left: trialDaysLeft,
      trial_expired: trialExpired,
    },
  });
});

// ---------- Perfil del negocio ----------
app.get('/api/profile', requireAuth, (req, res) => {
  const p = getProfile(req.session.userId);
  let pending = false;
  const at = req.session.igAttemptAt;
  if (at && !p.ig_connected && Date.now() - at < 15 * 60 * 1000) pending = true;
  else if (at) delete req.session.igAttemptAt; // conectado o vencido: limpiar
  let bestHour = 19;
  try {
    const u = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(req.session.userId);
    if (u && u.best_hour >= 9 && u.best_hour <= 21) bestHour = u.best_hour;
  } catch (e) {}
  res.json({ ...p, ig_pending: pending, best_hour: bestHour });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { business_name, category, tone, description, ig_username, competitors, goal } = req.body || {};
  if (!(business_name || '').trim()) return res.status(400).json({ error: 'El nombre del negocio es obligatorio' });
  getProfile(req.session.userId);
  db.prepare(
    `UPDATE profiles SET business_name=?, category=?, tone=?, description=?, ig_username=?, competitors=?, goal=?, updated_at=datetime('now') WHERE user_id=?`
  ).run(business_name || '', category || 'otro', tone || 'canchero', (description || '').slice(0, 600), ig_username || '', competitors || '', goal || '', req.session.userId);
  res.json({ ok: true });
});

function validTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

// ---------- Ajustes ----------
app.get('/api/settings', requireAuth, (req, res) => res.json(maskSettings(getSettings(req.session.userId))));

app.put('/api/settings', requireAuth, (req, res) => {
  const { openai_key, demo_mode, meta_app_id, meta_app_secret, ig_embed_url, image_base_url, timezone, preferred_palette, brand_colors, pexels_key } = req.body || {};
  const cur = getSettings(req.session.userId);
  let bc = cur.brand_colors || '';
  if (brand_colors !== undefined) {
    const arr = Array.isArray(brand_colors) ? brand_colors : [];
    const clean = arr.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3);
    bc = clean.length >= 2 ? JSON.stringify(clean) : '';
  }
  db.prepare(
    `UPDATE settings SET openai_key=?, demo_mode=?, meta_app_id=?, meta_app_secret=?, ig_embed_url=?, image_base_url=?, timezone=?, preferred_palette=?, brand_colors=?, pexels_key=?, updated_at=datetime('now') WHERE user_id=?`
  ).run(
    openai_key && !openai_key.startsWith('••••') ? openai_key : cur.openai_key,
    demo_mode === undefined ? cur.demo_mode : (demo_mode ? 1 : 0),
    meta_app_id || '',
    meta_app_secret && !meta_app_secret.startsWith('••••') ? meta_app_secret : cur.meta_app_secret,
    ig_embed_url || '',
    image_base_url !== undefined ? image_base_url : cur.image_base_url,
    validTimezone(timezone) ? timezone : (cur.timezone || DEFAULT_TZ),
    Number.isInteger(preferred_palette) ? preferred_palette : (cur.preferred_palette ?? 0),
    bc,
    pexels_key && !pexels_key.startsWith('••••') ? pexels_key : (cur.pexels_key || ''),
    req.session.userId
  );
  res.json({ ok: true });
});

// Probar credenciales de Meta sin guardarlas: valida App ID + Secret contra Graph API.
app.post('/api/settings/test-meta', requireAuth, async (req, res) => {
  const appId = String(req.body?.app_id || '').trim();
  const appSecret = String(req.body?.app_secret || '').trim();
  if (!appId || !appSecret) return res.json({ ok: false, error: 'Completá App ID y App Secret' });
  if (/^•+$/.test(appSecret)) return res.json({ ok: false, error: 'Ese es el valor oculto, escribí la clave real' });
  try {
    const r = await fetch(
      `https://graph.facebook.com/v26.0/${encodeURIComponent(appId)}?fields=name&access_token=${encodeURIComponent(appId)}|${encodeURIComponent(appSecret)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const j = await r.json();
    if (j.error) return res.json({ ok: false, error: j.error.message || 'Credenciales inválidas' });
    res.json({ ok: true, app_name: j.name || appId });
  } catch (e) {
    res.json({ ok: false, error: 'No se pudo contactar a Meta, probá de nuevo' });
  }
});

// ---------- Generador ----------
app.post('/api/generate', requireAuth, requireTrialValid, async (req, res) => {
  const { topic, n, seed, tipo } = req.body || {};
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Contanos el tema del posteo' });
  const profile = getProfile(req.session.userId);
  const settings = getSettings(req.session.userId);
  const count = Math.min(3, Math.max(1, parseInt(n, 10) || 1));
  try {
    let styleRules = [];
    try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(req.session.userId).map(r => r.rule_text); } catch (e) {}
    let voice = '';
    try { if (typeof voiceExamples === 'function') voice = voiceExamples(db, req.session.userId) || ''; } catch (e) {}
    const input = {
      business: profile.business_name,
      category: profile.category,
      description: profile.description,
      dna: readDna(req.session.userId),
      tone: profile.tone,
      topic: topic.trim(),
      tipo: tipo || '',
      competitors: profile.competitors,
      goal: profile.goal,
      taste: tasteProfile(req.session.userId),
      performance: [performanceBrief(db, req.session.userId), bestHoursLine(db, req.session.userId)].filter(Boolean).join('\n'),
      styleRules,
      voice,
      seedBase: parseInt(seed, 10) || 0,
    };
    const key = settings.openai_key || process.env.OPENAI_API_KEY || '';
    if (count > 1) {
      const out = await generateCaptions(input, count, key);
      return res.json(out); // { captions: [...], hashtags }
    }
    const out = await generateContent(input, key);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo generar el contenido' });
  }
});

// ---------- Creador v2: 6 opciones con foto, colores y energía ----------
app.post('/api/creator/options', requireAuth, async (req, res) => {
  const { topic, feedback, productPhoto } = req.body || {};
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'Contanos la idea del posteo' });
  try {
    const settings = getSettings(req.session.userId);
    // Foto del producto (opcional, paso 1): si existe en /media, es LA foto de las 6.
    let prodPhoto = null;
    const pp = String(productPhoto || '');
    if (pp.startsWith('/media/') && fs.existsSync(path.join(MEDIA_DIR, path.basename(pp)))) {
      prodPhoto = pp;
    }
    // Librería del usuario (opcional): sus fotos tienen prioridad sobre stock.
    const userPhotos = db
      .prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY created_at ASC`)
      .all(req.session.userId)
      .map((r) => r.file_path);
    const out = await creator.generateOptions({
      topic: String(topic).trim().slice(0, 300),
      feedback: String(feedback || '').trim().slice(0, 300),
      profile: getProfile(req.session.userId),
      settings,
      openaiKey: settings.openai_key || process.env.OPENAI_API_KEY || '',
      productPhoto: prodPhoto,
      userPhotos,
    });
    res.json(out);
  } catch (e) {
    console.error('[creator]', e.message);
    res.status(500).json({ error: e.message || 'No se pudieron armar las opciones' });
  }
});

// ---------- Creador v2: re-renderizar UNA opción con otra foto ("📷 Mi foto") ----------
app.post('/api/creator/rerender', requireAuth, async (req, res) => {
  try {
    const image = await creator.rerenderOption(req.body || {});
    res.json({ image });
  } catch (e) {
    console.error('[creator/rerender]', e.message);
    res.status(500).json({ error: e.message || 'No se pudo actualizar el diseño' });
  }
});

// ---------- Creador v2: programar N diseños de una ----------
app.post('/api/creator/schedule', requireAuth, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 6) {
    return res.status(400).json({ error: 'Elegí al menos un diseño' });
  }
  try {
    // Validar todo antes de insertar (nada a medias).
    const clean = items.map((it, i) => {
      const image = String((it && it.image) || '');
      if (!image.startsWith('/media/')) throw new Error(`Diseño ${i + 1}: imagen inválida`);
      const when = new Date((it && it.scheduled_at) || '');
      if (isNaN(when)) throw new Error(`Diseño ${i + 1}: fecha inválida`);
      return {
        image,
        caption: String((it && it.caption) || ''),
        hashtags: String((it && it.hashtags) || ''),
        scheduled_at: when.toISOString(),
      };
    });
    const stmt = db.prepare(
      'INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type) VALUES (?,?,?,?,?,?,?)'
    );
    const dupStmt = db.prepare(`SELECT id FROM posts WHERE user_id = ? AND status != 'cancelled' AND LOWER(TRIM(caption)) = LOWER(?) AND created_at > datetime('now', '-1 day')`);
    const ids = [];
    for (const c of clean) {
      const cap = c.caption.trim();
      if (cap && dupStmt.get(req.session.userId, cap)) continue; // ya existe hoy: no duplicar
      ids.push(stmt.run(req.session.userId, c.image, c.caption, c.hashtags, c.scheduled_at, 'scheduled', 'image').lastInsertRowid);
    }
    res.json({ ok: true, count: ids.length, ids });
  } catch (e) {
    console.error('[creator/schedule]', e.message);
    res.status(500).json({ error: e.message || 'No se pudieron programar' });
  }
});

// ---------- Ideas: nosotros pensamos el contenido por el cliente ----------
// ---------- Chat consultor de ideas: el cliente trae su idea, la pulen juntos ----------
// Hasta que la idea no queda exactamente como quiere el cliente, no se manda nada.
app.post('/api/ideas/chat', requireAuth, requireTrialValid, async (req, res) => {
  const { messages, photos, library, drafts, audio } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    if (typeof audio !== 'string' || !audio.startsWith('data:audio/')) return res.status(400).json({ error: 'Contanos tu idea' });
  }
  const clean = (Array.isArray(messages) ? messages : [])
    .slice(-10)
    .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', text: String((m && m.text) || '').slice(0, 2000) }))
    .filter(m => m.text.trim());
  // Nota de voz: transcribir con Whisper y usar el texto como mensaje del usuario.
  let chatNote = '';
  if (typeof audio === 'string' && audio.startsWith('data:audio/')) {
    const akey = (getSettings(req.session.userId).openai_key || process.env.OPENAI_API_KEY || '');
    const noAudio = { reply: 'No pude escuchar tu audio 🙏 ¿me lo escribís en una línea?', idea: null };
    if (!akey) return res.json(noAudio);
    let heard = '';
    try { heard = await transcribeAudio(audio, akey); } catch (e) { console.error('[chat] whisper:', e.message); }
    if (!heard) return res.json(noAudio);
    const lastUser = [...clean].reverse().find(m => m.role === 'user');
    if (lastUser) lastUser.text = heard.slice(0, 2000);
    else clean.push({ role: 'user', text: heard.slice(0, 2000) });
    chatNote = 'El cliente mandó una NOTA DE VOZ transcripta: convertí lo que pide en un posteo concreto, sin pedirle más datos salvo que sea imposible.';
  }
  if (!clean.length) return res.status(400).json({ error: 'Contanos tu idea' });
  // "no me propongas más promos" / "volvé a proponerme promos" → pausa directa, sin IA.
  {
    const lastUserText = (clean.filter(m => m.role === 'user').pop() || {}).text || '';
    const pm = lastUserText.match(/no (?:me )?propongas m[áa]s ([\wáéíóúñ ]{2,30})/i);
    const um = !pm && lastUserText.match(/volv[ée] a proponerme ([\wáéíóúñ ]{2,30})/i);
    const mm = pm || um;
    if (mm) {
      const tipo = palabraATipo(mm[1].trim().split(/\s+/).pop());
      if (tipo) {
        const uid = req.session.userId;
        setPausedTipo(uid, tipo, !!pm);
        const reply = pm
          ? `Listo, pauso ${TIPO_PLURAL[tipo] || 'ese tipo de posteos'} por un tiempo 👍`
          : `Dale, vuelvo a proponerte ${TIPO_PLURAL[tipo] || 'ese tipo de posteos'} 👍`;
        try {
          db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'user', lastUserText.slice(0, 2000));
          db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', reply);
        } catch (e) {}
        return res.json({ reply, idea: null });
      }
    }
  }
  const cleanPhotos = Array.isArray(photos)
    ? photos.filter(u => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 4)
    : [];
  const cleanLibrary = Array.isArray(library)
    ? library.filter(u => typeof u === 'string' && u.startsWith('data:image/')).slice(0, 6)
    : [];
  // Borradores en revisión: la IA los ve y puede editarlos directo (bloque ```edit)
  const cleanDrafts = Array.isArray(drafts)
    ? drafts.map(d => ({
        id: parseInt(d && d.id, 10) || 0,
        caption: String((d && d.caption) || '').slice(0, 300),
        when: String((d && d.when) || '').slice(0, 10),
      })).filter(d => d.id).slice(0, 10)
    : [];
  try {
    const settings = getSettings(req.session.userId);
    const uid0 = req.session.userId;
    const perfLine = [performanceBrief(db, uid0), bestHoursLine(db, uid0)].filter(Boolean).join('\n');
    // ADN del negocio: si no existe, la IA hace la entrevista (needDna)
    let dna = null, needDna = false;
    try {
      const dnarow = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid0);
      if (dnarow && dnarow.dna_json) { try { dna = JSON.parse(dnarow.dna_json); } catch (e) { dna = null; } }
    } catch (e) {}
    if (!dna || !Object.keys(dna).length) needDna = true;
    // Análisis de su Instagram (si se corrió al conectar)
    let igAnalysis = '';
    try {
      const iar = db.prepare('SELECT summary FROM ig_analysis WHERE user_id = ?').get(uid0);
      if (iar && iar.summary) igAnalysis = iar.summary;
    } catch (e) {}
    // Reglas de estilo que el cliente dictó o que aprendimos de sus ediciones
    let styleRules = [];
    try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(uid0).map(r => r.rule_text); } catch (e) {}
    // Frustración: bronca en el mensaje o ≥3 'rejected' en 30 min → la IA cambia de modo
    const lastUserText = clean[clean.length - 1].text || '';
    let frustrated = /no me gusta|horrible|malísimo|malisimo|pésimo|pesimo|otra vez|de nuevo|ya te dije/i.test(lastUserText);
    if (!frustrated) {
      try {
        const rej = db.prepare(`SELECT COUNT(*) AS c FROM post_signals WHERE user_id = ? AND client_signal = 'rejected' AND updated_at > datetime('now', '-30 minutes')`).get(uid0);
        frustrated = rej && rej.c >= 3;
      } catch (e) {}
    }
    // Voz del cliente: sus mejores captions como few-shot (si hay 3+ con alcance)
    let voice = '';
    try { if (typeof voiceExamples === 'function') voice = voiceExamples(db, uid0) || ''; } catch (e) {}
    // Inspiración visual (moodboard): que la IA la vea en contexto junto al gusto
    let inspoLine = '';
    try { if (dna && dna.inspo) inspoLine = `\nInspiración visual del cliente: ${dna.inspo}`; } catch (e) {}
    const out = await chatIdea(
      { messages: clean, profile: getProfile(req.session.userId), taste: tasteProfile(req.session.userId) + inspoLine, photos: cleanPhotos, library: cleanLibrary, drafts: cleanDrafts, performance: perfLine, dna, needDna, igAnalysis, frustrated, styleRules, voice, note: chatNote, tz: userTz(uid0) },
      settings.openai_key || process.env.OPENAI_API_KEY || ''
    );
    const uid = req.session.userId;
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'user', clean[clean.length - 1].text);
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', String(out.reply || '').slice(0, 2000));
    if (out.idea) db.prepare('INSERT INTO chat_state (user_id, idea_json, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET idea_json=excluded.idea_json, updated_at=excluded.updated_at').run(uid, JSON.stringify(out.idea), Date.now());
    else db.prepare('DELETE FROM chat_state WHERE user_id=?').run(uid);
    // La IA cerró el ADN del negocio → persistirlo con MERGE (no pisar serie, pausas ni inspo)
    let dnaSaved = false;
    if (out.dna && typeof out.dna === 'object') {
      try {
        const cur = readDna(uid);
        writeDna(uid, { ...cur, ...out.dna });
        dnaSaved = true;
      } catch (e) { console.error('[chat] dna save:', e.message); }
    }
    // La IA dictó una regla de estilo explícita → agregarla o quitarla
    if (out.rule && typeof out.rule === 'object') {
      try {
        const { normKey } = require('./style-learn');
        if (out.rule.add) {
          const key = normKey(out.rule.add);
          if (key) db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 1)
            ON CONFLICT(user_id, rule_key) DO UPDATE SET rule_text=excluded.rule_text, active=1`).run(uid, key, String(out.rule.add).slice(0, 200));
        }
        if (out.rule.remove) {
          const key = normKey(out.rule.remove);
          if (key) db.prepare('DELETE FROM style_rules WHERE user_id = ? AND rule_key = ?').run(uid, key);
        }
      } catch (e) { console.error('[chat] rule save:', e.message); }
    }
    // La IA sugirió una inspiración visual (moodboard) → guardarla en el ADN
    if (out.inspo && typeof out.inspo === 'string' && out.inspo.trim()) {
      try {
        const irow = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid);
        let iobj = {};
        if (irow && irow.dna_json) { try { iobj = JSON.parse(irow.dna_json); } catch (e) { iobj = {}; } }
        iobj.inspo = out.inspo.trim().slice(0, 500);
        db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET dna_json=excluded.dna_json, updated_at=datetime('now')`).run(uid, JSON.stringify(iobj));
      } catch (e) { console.error('[chat] inspo save:', e.message); }
    }
    // Edición directa de borradores pedida por el cliente vía chat.
    // La IA puede mandar VARIOS bloques ```edit (uno por borrador) y reprogramar con "when".
    let editApplied = null;
    if (Array.isArray(out.edits) && out.edits.length) {
      let n = 0;
      for (const ed of out.edits) {
        if (!(ed.draft >= 1 && ed.draft <= cleanDrafts.length)) continue;
        if (ed.caption === undefined && ed.hashtags === undefined && ed.photo_index === undefined && ed.when === undefined) continue;
        const target = cleanDrafts[ed.draft - 1];
        const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(target.id, uid);
        if (!post || (post.status !== 'draft' && post.status !== 'scheduled')) continue;
        db.prepare('UPDATE posts SET caption = ?, hashtags = ? WHERE id = ?').run(
          ed.caption !== undefined ? ed.caption : post.caption,
          ed.hashtags !== undefined ? ed.hashtags : post.hashtags,
          post.id
        );
        // Cambio de foto: el índice refiere a sus fotos guardadas (0 = la más nueva)
        if (Number.isInteger(ed.photo_index) && ed.photo_index >= 0) {
          const { photoPaths } = req.body || {};
          let newPath = null;
          if (Array.isArray(photoPaths) && photoPaths[ed.photo_index]) newPath = photoPaths[ed.photo_index];
          else {
            const rows = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY created_at DESC LIMIT 12`).all(uid);
            if (rows[ed.photo_index]) newPath = rows[ed.photo_index].file_path;
          }
          // Validar que la foto sea del usuario antes de usarla
          if (newPath && String(newPath).startsWith('/media/')) {
            const own = db.prepare(`SELECT id FROM assets WHERE user_id = ? AND file_path = ?`).get(uid, String(newPath));
            if (own) db.prepare(`UPDATE posts SET image_path = ? WHERE id = ?`).run(String(newPath), post.id);
          }
        }
        // Reprogramar: "AAAA-MM-DD HH:MM" en hora local del cliente → UTC. Solo futuro.
        if (typeof ed.when === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(ed.when.trim())) {
          const iso = zonedWallToUtc(ed.when.trim(), userTz(uid));
          if (iso && new Date(iso).getTime() > Date.now() + 5 * 60 * 1000) {
            db.prepare('UPDATE posts SET scheduled_at = ?, status = ? WHERE id = ?').run(iso, 'scheduled', post.id);
          }
        }
        recordSignal(uid, post, 'edited'); // lo retocó = señal de gusto
        n++;
      }
      if (n) editApplied = { ok: true, count: n };
    }
    res.json({ reply: out.reply, idea: out.idea || null, edit: editApplied, dna: dnaSaved, options: out.options || null });
  } catch (e) {
    console.error('[chat]', e.message);
    res.status(500).json({ error: 'No pudimos responder, probá de nuevo' });
  }
});

// Cupo semanal por plan: posteos (feed + reels) creados de lunes a domingo.
// Las historias son un bonus de la casa y no consumen cupo.
function weeklyQuota(userId) {
  const user = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(userId) || {};
  const plan = getPlan(user.plan_status === 'active' ? user.plan : TRIAL_PLAN);
  const limit = plan.postsPerWeek || 3;
  const st = getSettings(userId) || {};
  const tz = st.timezone || 'America/Argentina/Buenos_Aires';
  const monday = streaks.mondayKeyOf(streaks.tzToday(tz));
  let used = 0;
  try {
    used = db.prepare(`SELECT COUNT(*) AS n FROM posts
      WHERE user_id = ? AND status != 'cancelled' AND media_type != 'story'
      AND date(created_at) >= date(?)`).get(userId, monday).n || 0;
  } catch (e) { /* no bloquea */ }
  return { limit, used, left: Math.max(0, limit - used), plan: plan.id, plan_name: plan.name };
}
app.get('/api/quota', requireAuth, (req, res) => res.json(weeklyQuota(req.session.userId)));
// El frontend avisa hitos que solo él conoce (ej: semana aceptada).
app.post('/api/funnel', requireAuth, (req, res) => {
  const { event } = req.body || {};
  if (!/^[a-z_]{3,30}$/.test(event || '')) return res.status(400).json({ error: 'evento inválido' });
  track(req.session.userId, 'client_' + event);
  res.json({ ok: true });
});

// Panel del funnel (solo Valentino): ?token=ADMIN_TOKEN. Sin PII, solo conteos.
app.get('/api/admin/funnel', (req, res) => {
  const token = process.env.ADMIN_TOKEN || '';
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'no autorizado' });
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const events = ['prueba_done', 'registered', 'ig_connected', 'client_week_accepted', 'first_published', 'subscribed'];
  const totals = {};
  for (const e of events) {
    try {
      totals[e] = db.prepare(`SELECT COUNT(*) AS n FROM funnel_events WHERE event = ? AND datetime(created_at) >= datetime('now', ?)`).get(e, `-${days} days`).n;
    } catch (err) { totals[e] = 0; }
  }
  let byDay = [];
  try {
    byDay = db.prepare(`SELECT date(created_at) AS d, event, COUNT(*) AS n FROM funnel_events
      WHERE datetime(created_at) >= datetime('now', ?) GROUP BY d, event ORDER BY d DESC LIMIT 400`).all(`-${days} days`);
  } catch (err) { /* tabla nueva */ }
  res.json({ days, totals, by_day: byDay, admin_token_set: true });
});

// ---------- Publicidad: billetera + boost de posteos ganadores ----------
// Billetera (helpers)
function getAdWallet(userId) {
  let w = db.prepare('SELECT * FROM ad_wallets WHERE user_id = ?').get(userId);
  if (!w) {
    db.prepare('INSERT INTO ad_wallets (user_id) VALUES (?)').run(userId);
    w = db.prepare('SELECT * FROM ad_wallets WHERE user_id = ?').get(userId);
  }
  return w;
}
function adWalletMove(userId, amountCents, kind, ref, note) {
  const w = getAdWallet(userId);
  const after = w.balance_cents + amountCents;
  if (after < 0) throw new Error('Saldo insuficiente');
  db.prepare(`UPDATE ad_wallets SET balance_cents = ?, updated_at = datetime('now') WHERE user_id = ?`).run(after, userId);
  db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref, note) VALUES (?,?,?,?,?,?)`)
    .run(userId, kind, amountCents, after, ref || '', note || '');
  return after;
}
// País del negocio (para el targeting de la pauta): UY si el plan es UY, si no AR
function adCountry(userId) {
  try {
    const u = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
    if (u && u.plan && String(u.plan).toUpperCase().includes('UY')) return 'UY';
    const st = getSettings(userId) || {};
    if (st.country === 'UY' || st.country === 'UYU') return 'UY';
  } catch (e) {}
  return 'AR';
}

// Config + saldo para el frontend
app.get('/api/ads/config', requireAuth, (req, res) => {
  const w = getAdWallet(req.session.userId);
  res.json({
    ok: true,
    balance_cents: w.balance_cents,
    currency: w.currency,
    fee_pct: AD_FEE_PCT,
    min_topup_cents: AD_MIN_TOPUP_CENTS,
    topup_options: AD_TOPUP_OPTIONS,
    budget_options: AD_BUDGET_OPTIONS,
    min_budget_cents: AD_MIN_BUDGET_CENTS,
    default_days: AD_DEFAULT_DAYS,
    ads_ready: metaAds.adsConfigured(),
    mp_ready: mp.mpConfigured(),
  });
});

// Crear preferencia de MercadoPago para cargar crédito
app.post('/api/ads/topup', requireAuth, async (req, res) => {
  const cents = Math.round(Number(req.body.amount_cents) || 0);
  if (!mp.mpConfigured()) return res.status(503).json({ error: 'Pagos no configurados todavía. Escribinos y lo habilitamos.' });
  if (!(cents >= AD_MIN_TOPUP_CENTS)) {
    return res.status(400).json({ error: `La carga mínima es de ${fmtARS(AD_MIN_TOPUP_CENTS)}` });
  }
  const user = db.prepare('SELECT email, mp_payer_email FROM users WHERE id = ?').get(req.session.userId) || {};
  const host = req.get('host') || '';
  const baseUrl = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  const ref = `adtopup_${req.session.userId}_${Date.now().toString(36)}`;
  const backPath = req.body.return_to === 'semana' ? '#/app/semana' : '#/app/ads';
  try {
    const r = await mp.createTopupPreference({
      userId: req.session.userId, amountCents: cents, baseUrl,
      payerEmail: user.mp_payer_email || user.email, ref, backPath,
    });
    res.json({ ok: true, init_point: r.init_point });
  } catch (e) {
    res.status(502).json({ error: e.message || 'No se pudo generar el pago' });
  }
});

// Webhook de pagos únicos: acredita el crédito (idempotente por payment id)
app.post('/api/ads/webhook', async (req, res) => {
  const topic = req.query.topic || req.query.type || (req.body && req.body.type);
  const mpId = req.query.id || (req.body && req.body.data && req.body.data.id);
  if (!mp.mpConfigured()) return res.status(200).json({ ok: false, warning: 'MP no configurado' });
  if (topic !== 'payment' || !mpId) return res.status(200).json({ ok: true, ignored: true });
  try {
    const pay = await mp.getPayment(mpId);
    const ref = String(pay.external_reference || '');
    const m = ref.match(/^adtopup_(\d+)_/);
    if (!m || pay.status !== 'approved') return res.status(200).json({ ok: true, ignored: true });
    const userId = Number(m[1]);
    const dup = db.prepare(`SELECT id FROM ad_transactions WHERE ref = ? AND kind = 'topup'`).get(String(pay.id));
    if (dup) return res.status(200).json({ ok: true, deduped: true });
    const cents = Math.round(Number(pay.transaction_amount || 0) * 100);
    if (!(cents > 0)) return res.status(200).json({ ok: true, ignored: true });
    const after = adWalletMove(userId, cents, 'topup', String(pay.id), 'Carga de crédito publicitario');
    // El 20% se reconoce como ganancia de Posta EN EL MOMENTO DE LA CARGA (no espera a que usen el crédito).
    // Es solo contabilidad interna: el cliente sigue viendo sus $10.000 completos en la billetera.
    try {
      const feeCents = Math.round(cents * AD_FEE_PCT / 100);
      if (feeCents > 0) {
        db.prepare(`INSERT INTO ad_transactions (user_id, kind, amount_cents, balance_after, ref, note)
          VALUES (?, 'fee_earned', ?, ?, ?, 'Comisión Posta (interna, al cargar)')`)
          .run(userId, feeCents, after, String(pay.id));
      }
    } catch (e) {}
    try { track(userId, 'ad_topup', String(cents)); } catch (e) {}
    console.log(`[posta] 💰 Crédito ads acreditado: usuario ${userId}, ${fmtARS(cents)} (MP ${pay.id})`);
    res.status(200).json({ ok: true, balance_cents: after });
  } catch (e) {
    console.error('[posta] Webhook ads falló:', e.message);
    res.status(200).json({ ok: false, error: 'retry' });
  }
});

// Recomendaciones: posteos publicados (30d) con engagement rate arriba del promedio.
// Solo ganadores probados — nunca se pauta un posteo nuevo sin datos.
app.get('/api/ads/recommendations', requireAuth, (req, res) => {
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT p.id, p.image_path, p.caption, p.ig_media_id,
             COALESCE(m.reach,0) AS reach, COALESCE(m.likes,0) AS likes,
             COALESCE(m.comments,0) AS comments, COALESCE(m.saves,0) AS saves
      FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
        AND p.ig_media_id IS NOT NULL AND p.ig_media_id != ''
        AND datetime(p.published_at) >= datetime('now', '-30 days')`).all(req.session.userId);
  } catch (e) {}
  let boostedIds = [];
  try {
    boostedIds = db.prepare(`SELECT ig_media_id FROM ad_boosts WHERE user_id = ? AND status IN ('pending','active')`).all(req.session.userId).map(r => r.ig_media_id);
  } catch (e) {}
  const boosted = new Set(boostedIds);
  const scored = rows
    .filter(r => !boosted.has(r.ig_media_id) && r.reach >= 50)
    .map(r => {
      const eng = (r.likes || 0) + (r.comments || 0) + (r.saves || 0);
      return { ...r, eng, er: r.reach > 0 ? eng / r.reach : 0 };
    });
  const avg = scored.length ? scored.reduce((a, r) => a + r.er, 0) / scored.length : 0;
  const top = scored.filter(r => r.er >= avg * 1.2 && r.er > 0).sort((a, b) => b.er - a.er).slice(0, 3);
  res.json({
    ok: true,
    recommendations: top.map(r => ({
      post_id: r.id, image_path: r.image_path, caption: (r.caption || '').slice(0, 90),
      ig_media_id: r.ig_media_id, reach: r.reach, likes: r.likes, comments: r.comments,
      saves: r.saves, er_pct: Math.round(r.er * 1000) / 10,
    })),
    avg_er_pct: Math.round(avg * 1000) / 10,
    has_data: scored.length > 0,
  });
});

// Crear una pauta: debita la billetera y la lanza en Meta (o queda pendiente)
app.post('/api/ads/boost', requireAuth, async (req, res) => {
  const postId = Number(req.body.post_id) || 0;
  const budgetCents = Math.round(Number(req.body.budget_cents) || 0);
  if (!postId) return res.status(400).json({ error: 'Elegí un posteo' });
  if (!(budgetCents >= AD_MIN_BUDGET_CENTS)) {
    return res.status(400).json({ error: `El presupuesto mínimo por pauta es de ${fmtARS(AD_MIN_BUDGET_CENTS)}` });
  }
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(postId, req.session.userId);
  if (!post || !post.ig_media_id) {
    return res.status(400).json({ error: 'Ese posteo no se puede potenciar: tiene que estar publicado en Instagram' });
  }
  const { fee_cents, spend_cents } = adSplit(budgetCents);
  const w = getAdWallet(req.session.userId);
  if (w.balance_cents < budgetCents) {
    return res.status(402).json({ error: 'no_balance', message: 'No tenés crédito suficiente para esta pauta. Cargá crédito primero.' });
  }
  adWalletMove(req.session.userId, -budgetCents, 'boost_hold', '', `Pauta: ${(post.caption || 'posteo').slice(0, 40)}`);
  const br = db.prepare(`INSERT INTO ad_boosts
    (user_id, post_id, ig_media_id, budget_cents, fee_cents, spend_cents, currency, status, objective, duration_days)
    VALUES (?,?,?,?,?,?,'ARS','pending','engagement',?)`)
    .run(req.session.userId, postId, post.ig_media_id, budgetCents, fee_cents, spendCents, AD_DEFAULT_DAYS);
  const boostId = br.lastInsertRowid;
  try { track(req.session.userId, 'ad_boost', String(budgetCents)); } catch (e) {}

  // Lanzar en Meta si está configurado; si no, queda pendiente y la activa el equipo
  let launched = false, launchError = '';
  if (metaAds.adsConfigured()) {
    try {
      const user = db.prepare('SELECT ig_user_id FROM users WHERE id = ?').get(req.session.userId) || {};
      if (!user.ig_user_id) throw new Error('Conectá tu Instagram primero');
      const pageId = await metaAds.resolvePageId(user.ig_user_id);
      const r = await metaAds.createBoost({
        name: `Posta · Boost #${boostId} · u${req.session.userId}`,
        pageId, igUserId: user.ig_user_id, igMediaId: post.ig_media_id,
        spendCents, days: AD_DEFAULT_DAYS, country: adCountry(req.session.userId),
      });
      db.prepare(`UPDATE ad_boosts SET status='active', meta_campaign_id=?, meta_adset_id=?, meta_ad_id=?, started_at=datetime('now'), error='' WHERE id=?`)
        .run(r.campaignId, r.adsetId, r.adId, boostId);
      launched = true;
    } catch (e) {
      launchError = String(e.message || e).slice(0, 300);
      db.prepare(`UPDATE ad_boosts SET error=? WHERE id=?`).run(launchError, boostId);
    }
  }
  const w2 = getAdWallet(req.session.userId);
  res.json({
    ok: true, boost_id: boostId, launched, launch_error: launchError,
    balance_cents: w2.balance_cents,
    message: launched
      ? '🚀 Tu pauta ya está corriendo en Instagram y Facebook.'
      : '¡Listo! Tu pauta quedó programada: la activamos en las próximas horas y te avisamos.',
  });
});

// Historial de pautas (refresca métricas de las activas, best effort)
app.get('/api/ads/boosts', requireAuth, async (req, res) => {
  let boosts = [];
  try { boosts = db.prepare(`SELECT * FROM ad_boosts WHERE user_id = ? ORDER BY id DESC LIMIT 20`).all(req.session.userId); } catch (e) {}
  if (metaAds.adsConfigured()) {
    for (const b of boosts) {
      if (b.status !== 'active' || !b.meta_campaign_id) continue;
      const stale = !b.stats_updated_at || (Date.now() - new Date(b.stats_updated_at + 'Z').getTime() > 3600000);
      if (!stale) continue;
      try {
        const s = await metaAds.getBoostStats(b.meta_campaign_id);
        if (s) {
          db.prepare(`UPDATE ad_boosts SET last_spend_cents=?, last_reach=?, last_impressions=?, stats_updated_at=datetime('now') WHERE id=?`)
            .run(s.spend_cents, s.reach, s.impressions, b.id);
          b.last_spend_cents = s.spend_cents; b.last_reach = s.reach; b.last_impressions = s.impressions;
        }
      } catch (e) { /* no bloquea el historial */ }
    }
  }
  res.json({ ok: true, boosts: boosts.map(b => ({ ...b })) });
});

// Admin: pautas pendientes de activación manual (equipo Posta)
app.get('/api/admin/ads', (req, res) => {
  const token = process.env.ADMIN_TOKEN || '';
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'no autorizado' });
  let pending = [];
  try {
    pending = db.prepare(`SELECT b.*, u.email FROM ad_boosts b JOIN users u ON u.id = b.user_id
      WHERE b.status = 'pending' ORDER BY b.id DESC LIMIT 50`).all();
  } catch (e) {}
  // Caja: comisión ganada al cargar vs crédito que se les debe a los clientes
  let earned = 0, walletsTotal = 0, spent = 0;
  try {
    earned = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM ad_transactions WHERE kind = 'fee_earned'`).get().n;
    walletsTotal = db.prepare(`SELECT COALESCE(SUM(balance_cents),0) AS n FROM ad_wallets`).get().n;
    spent = db.prepare(`SELECT COALESCE(SUM(spend_cents),0) AS n FROM ad_boosts WHERE status = 'active'`).get().n;
  } catch (e) {}
  res.json({ ok: true, pending, ads_configured: metaAds.adsConfigured(),
    earned_cents: earned, wallets_total_cents: walletsTotal, active_spend_cents: spent });
});

// ---------- Reporte semanal "tu semana en números" (in-app) ----------
app.get('/api/weekly-report', requireAuth, (req, res) => {
  let posts = [];
  try {
    posts = db.prepare(`
      SELECT p.id, p.caption, p.image_path, p.media_type, p.published_at,
             COALESCE(m.reach,0) AS reach, COALESCE(m.likes,0) AS likes,
             COALESCE(m.comments,0) AS comments, COALESCE(m.saved,0) AS saved
      FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
        AND datetime(p.published_at) >= datetime('now', '-7 days')
      ORDER BY p.published_at DESC LIMIT 10`).all(req.session.userId);
  } catch (e) { /* tabla nueva */ }
  const totals = posts.reduce((a, r) => ({
    reach: a.reach + r.reach, likes: a.likes + r.likes, comments: a.comments + r.comments,
  }), { reach: 0, likes: 0, comments: 0 });
  res.json({ posts, totals });
});

// ---------- Comentarios de Instagram: responder en un toque ----------
app.get('/api/comments', requireAuth, (req, res) => {
  let rows = [];
  try {
    rows = db.prepare(`SELECT id, username, text, suggested, ig_media_id, created_at FROM comment_queue
      WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 20`).all(req.session.userId);
  } catch (e) { /* tabla nueva */ }
  res.json({ comments: rows });
});
app.post('/api/comments/refresh', requireAuth, requireTrialValid, async (req, res) => {
  try {
    const { syncComments } = require('./insights');
    const st = getSettings(req.session.userId) || {};
    const n = await syncComments(db, req.session.userId, suggestReply, st.openai_key || process.env.OPENAI_API_KEY || '');
    res.json({ ok: true, fresh: n });
  } catch (e) {
    res.status(500).json({ error: 'No pudimos revisar los comentarios' });
  }
});
app.post('/api/comments/:id/reply', requireAuth, async (req, res) => {
  try {
    const { replyComment } = require('./insights');
    const c = db.prepare('SELECT * FROM comment_queue WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
    if (!c || c.status !== 'pending') return res.status(404).json({ error: 'Comentario no encontrado' });
    const message = String((req.body && req.body.message) || c.suggested || '').slice(0, 1000);
    if (!message.trim()) return res.status(400).json({ error: 'La respuesta está vacía' });
    await replyComment(db, req.session.userId, c.ig_comment_id, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No pudimos responder: ' + String(e.message).slice(0, 120) });
  }
});
app.post('/api/comments/:id/dismiss', requireAuth, (req, res) => {
  try { db.prepare(`UPDATE comment_queue SET status='dismissed' WHERE id = ? AND user_id = ?`).run(req.params.id, req.session.userId); } catch (e) {}
  res.json({ ok: true });
});

// Historial del chat consultor (persiste entre sesiones) + idea cerrada pendiente
app.get('/api/ideas/chat', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const msgs = db.prepare('SELECT role, text FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 60').all(uid).reverse();
  const st = db.prepare('SELECT idea_json FROM chat_state WHERE user_id=?').get(uid);
  let idea = null;
  try { idea = st ? JSON.parse(st.idea_json) : null; } catch (e) { idea = null; }
  res.json({ messages: msgs, idea: idea && idea.titulo ? idea : null });
});

// Log de eventos locales del chat (confirmaciones de edición, fotos) y limpieza de la idea
app.post('/api/ideas/chat/log', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const { messages, clearIdea } = req.body || {};
  try {
    if (clearIdea) db.prepare('DELETE FROM chat_state WHERE user_id=?').run(uid);
    if (Array.isArray(messages)) {
      const ins = db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)');
      for (const m of messages.slice(0, 10)) {
        if ((m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
          ins.run(uid, m.role, m.text.slice(0, 2000));
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'No se pudo guardar' }); }
});

app.post('/api/ideas', requireAuth, requireTrialValid, async (req, res) => {
  const profile = getProfile(req.session.userId);
  const settings = getSettings(req.session.userId);
  const dna = readDna(req.session.userId);
  // Gate anti-invención: sin datos mínimos del negocio no se genera nada.
  // Generar con el perfil vacío es lo que produce posteos inventados ("PRODCT XYZ").
  const descOk = (profile.description || '').trim().length >= 20;
  const dnaOk = (dna.producto_estrella || '').trim().length >= 3;
  if (!descOk && !dnaOk) return res.json({ need_profile: true });
  try {
    // Temas publicados recientemente: el generador debe evitar repetirlos
    let recentTopics = '';
    try {
      const recent = db.prepare(`SELECT caption FROM posts WHERE user_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 12`).all(req.session.userId);
      recentTopics = recent.map(r => String(r.caption || '').split('\n')[0].slice(0, 80)).filter(Boolean).join(' | ');
    } catch (e) { /* sin historial: no se filtra nada */ }
    const ideas = await generateIdeas(
      {
        business: profile.business_name,
        category: profile.category,
        tone: profile.tone,
        description: profile.description,
        dna,
        competitors: profile.competitors,
        goal: profile.goal,
        taste: tasteProfile(req.session.userId),
        recentTopics,
        ephemeris: upcomingEphemeris(12)[0] || null,
      },
      settings.openai_key || process.env.OPENAI_API_KEY || ''
    );
    res.json({ ideas });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron generar las ideas' });
  }
});

// ---------- Subida de imagen (PNG del diseñador) ----------
app.post('/api/media', requireAuth, express.raw({ type: 'image/*', limit: '15mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Imagen vacía' });
  const ct = req.get('Content-Type') || '';
  const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
  res.json({ path: `/media/${name}` });
});

// ---------- Librería de medios del cliente (fotos + logo) ----------
app.get('/api/assets', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, file_path, kind, created_at FROM assets WHERE user_id = ? ORDER BY created_at ASC').all(req.session.userId);
  res.json(rows);
});

app.post('/api/assets', requireAuth, express.raw({ type: ['image/*', 'video/*'], limit: '100mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Archivo vacío' });
  const qk = req.query.kind;
  const kind = qk === 'logo' ? 'logo' : qk === 'video' ? 'video' : 'photo';
  const ct = req.get('Content-Type') || '';
  if (kind === 'video' && !ct.startsWith('video/')) return res.status(400).json({ error: 'Tiene que ser un video' });
  if (kind !== 'video' && !ct.startsWith('image/')) return res.status(400).json({ error: 'Tiene que ser una imagen' });
  if (kind === 'photo') {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND kind = 'photo'`).get(req.session.userId).c;
    if (n >= 20) return res.status(400).json({ error: 'Llegaste al máximo de 20 fotos' });
  }
  if (kind === 'video') {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND kind = 'video'`).get(req.session.userId).c;
    if (n >= 10) return res.status(400).json({ error: 'Llegaste al máximo de 10 videos' });
  }
  const ext = ct.includes('quicktime') ? 'mov' : ct.includes('mp4') ? 'mp4' : ct.includes('webm') ? 'webm'
    : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
  const filePath = `/media/${name}`;
  if (kind === 'logo') {
    // Un solo logo: reemplaza el anterior
    const olds = db.prepare(`SELECT id, file_path FROM assets WHERE user_id = ? AND kind = 'logo'`).all(req.session.userId);
    for (const o of olds) {
      try { fs.unlinkSync(path.join(MEDIA_DIR, path.basename(o.file_path))); } catch (_) {}
    }
    db.prepare(`DELETE FROM assets WHERE user_id = ? AND kind = 'logo'`).run(req.session.userId);
  }
  const r = db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)').run(req.session.userId, filePath, kind);
  res.json({ ok: true, id: r.lastInsertRowid, path: filePath, kind });
});

app.delete('/api/assets/:id', requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  try { fs.unlinkSync(path.join(MEDIA_DIR, path.basename(a.file_path))); } catch (_) {}
  db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
  res.json({ ok: true });
});

// ---------- Subida de audio (mp3 para videos) ----------
app.post('/api/audio', requireAuth, express.raw({ type: 'audio/mpeg', limit: '15mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Audio vacío' });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.mp3`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
  res.json({ path: `/media/${name}` });
});

// Resuelve una ruta /media/xxx a archivo local dentro de MEDIA_DIR (anti path traversal)
function mediaFile(localPath) {
  if (!localPath || typeof localPath !== 'string' || !localPath.startsWith('/media/')) return null;
  const file = path.join(MEDIA_DIR, path.basename(localPath));
  if (!file.startsWith(path.resolve(MEDIA_DIR) + path.sep)) return null;
  return fs.existsSync(file) ? file : null;
}

// ---------- Generador de video ----------
app.post('/api/videos', requireAuth, async (req, res) => {
  if (!ffmpegAvailable()) {
    return res.status(500).json({ error: 'Instalá ffmpeg (ej: brew install ffmpeg)' });
  }
  const { scenes, music_path } = req.body || {};
  if (!Array.isArray(scenes) || !scenes.length || scenes.length > 5) {
    return res.status(400).json({ error: 'El video lleva de 1 a 5 escenas' });
  }
  try {
    const prepared = scenes.map((s, i) => {
      const file = mediaFile(s.image_path);
      if (!file) throw new Error(`Escena ${i + 1}: imagen inválida`);
      const duration = Math.min(30, Math.max(1, Math.round(Number(s.duration) || 3)));
      return { file, text: String(s.text || '').slice(0, 140), duration };
    });
    const total = prepared.reduce((a, s) => a + s.duration, 0);
    if (total > 60) return res.status(400).json({ error: 'El video no puede durar más de 60 segundos' });
    let musicFile = null;
    if (music_path) {
      musicFile = mediaFile(music_path);
      if (!musicFile) return res.status(400).json({ error: 'Música inválida' });
    }
    const out = await renderVideo({ scenes: prepared, musicFile, mediaDir: MEDIA_DIR });
    res.json({ ok: true, url: out.url, duration: out.duration });
  } catch (e) {
    console.error('[posta] Error generando video:', e.message);
    res.status(500).json({ error: e.message || 'No se pudo generar el video' });
  }
});

// ---------- Posts ----------
app.get('/api/posts', requireAuth, (req, res) => {
  const { status } = req.query;
  const join = 'LEFT JOIN post_signals s ON s.user_id = p.user_id AND s.post_id = p.id';
  let rows;
  if (status) {
    rows = db.prepare(`SELECT p.*, s.client_signal AS signal FROM posts p ${join} WHERE p.user_id = ? AND p.status = ? ORDER BY p.scheduled_at ASC, p.created_at DESC`).all(req.session.userId, status);
  } else {
    rows = db.prepare(`SELECT p.*, s.client_signal AS signal FROM posts p ${join} WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 100`).all(req.session.userId);
  }
  res.json(rows);
});

// Si el usuario nunca configuró image_base_url, la deducimos del host actual (https en
// producción). Sin esto Instagram no puede descargar la imagen y la publicación real falla.
function ensureImageBaseUrl(db, userId, req) {
  try {
    if (process.env.IMAGE_BASE_URL) return;
    const s = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(userId);
    if (s && s.image_base_url) return;
    const rawHost = req.get('host') || '';
    if (!rawHost) return;
    const proto = /localhost|127\.0\.0\.1/.test(rawHost.split(':')[0]) ? 'http' : 'https';
    db.prepare(`UPDATE settings SET image_base_url = ?, updated_at = datetime('now') WHERE user_id = ?`)
      .run(`${proto}://${rawHost}`, userId);
  } catch (e) { /* no bloquea la creación del post */ }
}

app.post('/api/posts', requireAuth, requireTrialValid, (req, res) => {
  const { image_path, caption, hashtags, scheduled_at, media_type, source_topic, source_angle, carousel_paths, tipo } = req.body || {};
  if (!image_path) return res.status(400).json({ error: 'Falta la imagen' });
  // Anti-duplicados: mismo texto en las últimas 24h (no cancelado) = avisar en vez de crear otro
  const cap = (caption || '').trim();
  if (cap) {
    const dup = db.prepare(`SELECT id FROM posts WHERE user_id = ? AND status != 'cancelled' AND LOWER(TRIM(caption)) = LOWER(?) AND created_at > datetime('now', '-1 day')`).get(req.session.userId, cap);
    if (dup) return res.status(409).json({ error: 'Ya creaste este posteo hoy. Lo ves en tu historial.', post_id: dup.id });
  }
  const status = scheduled_at ? 'scheduled' : 'draft';
  const mt = media_type === 'video' ? 'video' : media_type === 'story' ? 'story' : media_type === 'carousel' ? 'carousel' : 'image';
  // Cupo del plan: las historias no consumen cupo (bonus de la casa). El carrusel cuenta como 1 posteo.
  if (mt !== 'story') {
    const q = weeklyQuota(req.session.userId);
    if (q.left <= 0) {
      return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: q.limit, plan_name: q.plan_name,
        message: `Llegaste al límite de tu plan ${q.plan_name} (${q.limit} posteos por semana). Mejorá tu paquete para seguir posteando esta semana.` });
    }
  }
  let cpaths = '';
  if (mt === 'carousel' && Array.isArray(carousel_paths)) {
    cpaths = JSON.stringify(carousel_paths.filter(Boolean).slice(0, 10));
  }
  const r = db.prepare(
    'INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, source_topic, source_angle, carousel_paths, tipo) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(req.session.userId, image_path, caption || '', hashtags || '', scheduled_at || null, status, mt, source_topic || '', source_angle || '', cpaths, ['promo','tip','social','detras','novedad'].includes(tipo) ? tipo : '');
  ensureImageBaseUrl(db, req.session.userId, req);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.patch('/api/posts/:id', requireAuth, (req, res) => {
  const { scheduled_at, caption, hashtags, image_path, action } = req.body || {};
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (action === 'cancel') {
    db.prepare(`UPDATE posts SET status='cancelled' WHERE id=?`).run(post.id);
    recordSignal(req.session.userId, post, 'rejected'); // lo canceló = no le gustó
  } else if (action === 'save-draft') {
    // Guarda cambios en un borrador SIN programarlo (flujo de revisión del autopilot).
    // También acepta image_path para la regeneración de un borrador (↻).
    const edited = (caption !== undefined && caption !== post.caption) || (hashtags !== undefined && hashtags !== post.hashtags) || (image_path && image_path !== post.image_path);
    // Style-learn: si editó el caption a mano, aprendemos QUÉ cambió (sin emojis, más corto, con precios...)
    if (caption !== undefined && caption !== post.caption) {
      try { require('./style-learn').learnFromCaptionEdit(db, req.session.userId, post.caption, caption); } catch (e) {}
    }
    db.prepare(`UPDATE posts SET caption=?, hashtags=?, image_path=? WHERE id=?`).run(caption ?? post.caption, hashtags ?? post.hashtags, image_path || post.image_path, post.id);
    if (edited) recordSignal(req.session.userId, post, 'edited'); // tocó el texto en revisión
    return res.json({ ok: true });
  } else {
    const edited = (caption !== undefined && caption !== post.caption) || (hashtags !== undefined && hashtags !== post.hashtags);
    db.prepare(`UPDATE posts SET scheduled_at=?, caption=?, hashtags=?, status='scheduled', error='' WHERE id=?`).run(
      scheduled_at || post.scheduled_at, caption ?? post.caption, hashtags ?? post.hashtags, post.id
    );
    if (edited) recordSignal(req.session.userId, post, 'edited'); // tocó el texto antes de que salga
  }
  res.json({ ok: true });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (post) recordSignal(req.session.userId, post, 'rejected'); // lo eliminó = no le gustó
  db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Estado de un posteo (para el seguimiento en vivo de "Publicar ahora")
app.get('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare(
    'SELECT id, status, error, ig_permalink, published_at, scheduled_at FROM posts WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  res.json({ ok: true, post });
});

// Publicar AHORA de forma inmediata: no espera al scheduler.
// Idempotente: si ya se está publicando o ya salió, no lo duplica.
app.post('/api/posts/:id/publish-now', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (post.status === 'publishing') return res.json({ ok: true, status: 'publishing' });
  if (post.status === 'published') return res.json({ ok: true, status: 'published', permalink: post.ig_permalink });
  if (!['draft', 'scheduled', 'failed'].includes(post.status)) {
    return res.status(400).json({ error: 'Este posteo no se puede publicar ahora' });
  }
  db.prepare(`UPDATE posts SET status='publishing', scheduled_at=datetime('now'), error='' WHERE id=?`).run(post.id);
  ensureImageBaseUrl(db, req.session.userId, req);
  // La publicación corre en segundo plano; el frontend consulta GET /api/posts/:id
  publishSinglePost(db, { ...post, status: 'publishing' }).catch((e) => console.error('[posta] publish-now:', e.message));
  res.json({ ok: true, status: 'publishing' });
});

// Duplicar un posteo como borrador (para re-publicarlo sin armarlo de cero)
app.post('/api/posts/:id/duplicate', requireAuth, requireTrialValid, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  // Duplicar también consume cupo del plan
  const q = weeklyQuota(req.session.userId);
  if (q.left <= 0) {
    return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: q.limit, plan_name: q.plan_name,
      message: `Llegaste al límite de tu plan ${q.plan_name} (${q.limit} posteos por semana). Mejorá tu paquete para seguir posteando esta semana.` });
  }
  const r = db.prepare(
    'INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type) VALUES (?,?,?,?,?,?,?)'
  ).run(req.session.userId, post.image_path, post.caption, post.hashtags, null, 'draft', post.media_type || 'image');
  res.json({ ok: true, id: r.lastInsertRowid });
});

// ---------- Loop inteligente fase 1: señales + resumen ----------
// Semana con inicio lunes (zona horaria del negocio). week_key = 'YYYY-MM-DD' del lunes.
function tzToday(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function ymdInTz(iso, tz) {
  if (!iso) return null;
  try {
    const d = new Date(String(iso).length === 16 ? iso : String(iso).replace(' ', 'T'));
    if (isNaN(d)) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch { return null; }
}
function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function userTz(userId) {
  try { return getSettings(userId).timezone || 'America/Argentina/Buenos_Aires'; }
  catch { return 'America/Argentina/Buenos_Aires'; }
}
// "2026-09-30 18:00" como hora local en tz → ISO UTC. null si es inválido.
function zonedWallToUtc(s, tz) {
  try {
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) return null;
    const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5];
    if (Y < 2026 || Y > 2030 || Mo < 1 || Mo > 12 || D < 1 || D > 31 || h > 23 || mi > 59) return null;
    const zone = tz || DEFAULT_TZ;
    const guess = Date.UTC(Y, Mo - 1, D, h, mi);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = {};
    for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
    return new Date(guess - (asUtc - guess)).toISOString();
  } catch (e) { return null; }
}
function postWeekKey(p, tz) {
  return mondayKeyOf(ymdInTz(p.scheduled_at || p.published_at || p.created_at, tz) || tzToday(tz));
}
// Guarda (o actualiza) la señal del cliente para un posteo. La última señal vale.
// Perfil de gusto del cliente a partir de sus 👍/👎: se inyecta en el prompt para que la IA aprenda de verdad.
function tasteProfile(userId) {
  try {
    const rows = db.prepare(`
      SELECT s.caption AS caption, s.client_signal AS sig FROM post_signals s
      WHERE s.user_id = ? AND s.client_signal IN ('approved','rejected')
      ORDER BY s.updated_at DESC LIMIT 12
    `).all(userId);
    const liked = [], disliked = [];
    for (const r of rows) {
      const cap = (r.caption || '').split('\n')[0].slice(0, 120).trim();
      if (!cap) continue;
      if (r.sig === 'approved' && liked.length < 3 && !liked.includes(cap)) liked.push(cap);
      else if (r.sig === 'rejected' && disliked.length < 3 && !disliked.includes(cap)) disliked.push(cap);
    }
    if (!liked.length && !disliked.length) return '';
    let t = '';
    if (liked.length) t += `\nAl cliente le GUSTARON estos posteos (escribí más en esta línea):\n- ${liked.join('\n- ')}`;
    if (disliked.length) t += `\nAl cliente NO le gustaron estos (evitá este estilo y estos temas):\n- ${disliked.join('\n- ')}`;
    return t;
  } catch (e) { return ''; }
}
function recordSignal(userId, post, signal) {
  try {
    const tz = userTz(userId);
    const prof = getProfile(userId) || {};
    const wk = postWeekKey(post, tz);
    db.prepare(`
      INSERT INTO post_signals (user_id, post_id, caption, hashtags, scheduled_for, rubro, client_signal, week_key, updated_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id, post_id) DO UPDATE SET
        client_signal=excluded.client_signal, caption=excluded.caption, hashtags=excluded.hashtags,
        scheduled_for=excluded.scheduled_for, rubro=excluded.rubro,
        week_key=excluded.week_key, updated_at=datetime('now')
    `).run(userId, post.id, post.caption || '', post.hashtags || '', post.scheduled_at || '', prof.category || '', signal, wk);
  } catch (e) { console.error('[posta] recordSignal:', e.message); }
}

// Señal manual (👍/👎) sobre un posteo
app.post('/api/posts/:id/signal', requireAuth, (req, res) => {
  const { signal } = req.body || {};
  if (!['approved', 'edited', 'rejected'].includes(signal)) return res.status(400).json({ error: 'Señal inválida' });
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  recordSignal(req.session.userId, post, signal);
  res.json({ ok: true });
});

// ---------- Rachas ----------
// El cliente la llama cuando runAutopilot termina bien (semana armada).
// Idempotente por semana: no suma doble si arma dos veces la misma semana.
app.post('/api/streak/week-armed', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const tz = userTz(uid);
  const weekKey = mondayKeyOf(tzToday(tz));
  res.json(streaks.recordWeekArmed(db, uid, weekKey));
});

app.get('/api/streak', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const tz = userTz(uid);
  const weekKey = mondayKeyOf(tzToday(tz));
  res.json(streaks.publicStreak(db, uid, weekKey, tzToday(tz)));
});

// Prueba social 100% anónima: solo agregados, solo con masa crítica (15+ días).
app.get('/api/streak/social', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const tz = userTz(uid);
  const thisMon = mondayKeyOf(tzToday(tz));
  res.json(streaks.socialProof(db, {
    excludeUserId: uid, thisMon, prevMon: shiftDays(thisMon, -7),
  }));
});

// Resumen para el dashboard "Mi semana": semana actual, aprobación, ritmo y mes.
// Métricas honestas de actividad propia (posteos), NUNCA métricas de Instagram.
app.get('/api/stats/summary', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const tz = userTz(uid);
  const curWeek = mondayKeyOf(tzToday(tz));
  const posts = db.prepare('SELECT * FROM posts WHERE user_id = ?').all(uid);
  const withWk = posts.map((p) => ({ ...p, _wk: postWeekKey(p, tz) }));
  const sigRows = db.prepare('SELECT post_id, client_signal FROM post_signals WHERE user_id = ?').all(uid);
  const sigMap = Object.fromEntries(sigRows.map((r) => [r.post_id, r.client_signal]));

  const weekPosts = withWk
    .filter((p) => p._wk === curWeek && p.status !== 'cancelled')
    .sort((a, b) => String(a.scheduled_at || a.created_at).localeCompare(String(b.scheduled_at || b.created_at)));
  const byStatus = {};
  for (const p of weekPosts) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  const ready = weekPosts.filter((p) => ['scheduled', 'publishing', 'published'].includes(p.status)).length;

  const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(uid) || {};
  const ppw = (getPlan(u.plan_status === 'active' ? u.plan : TRIAL_PLAN).postsPerWeek) || 3;

  const weekly = [];
  for (let i = 7; i >= 0; i--) {
    const wk = shiftDays(curWeek, -i * 7);
    weekly.push({
      key: wk,
      label: wk.slice(8) + '/' + wk.slice(5, 7),
      total: withWk.filter((p) => p._wk === wk && p.status !== 'cancelled').length,
    });
  }

  let approved = 0, edited = 0, rejected = 0;
  for (const r of sigRows) {
    if (r.client_signal === 'approved') approved++;
    else if (r.client_signal === 'edited') edited++;
    else if (r.client_signal === 'rejected') rejected++;
  }
  const sigTotal = approved + edited + rejected;

  const mk = tzToday(tz).slice(0, 7);
  const monthPublished = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published' AND substr(published_at, 1, 7) = ?`).get(uid, mk).c;
  const monthScheduled = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'scheduled'`).get(uid).c;
  const totalPublished = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'`).get(uid).c;
  const tasteLearned = db.prepare(`SELECT COUNT(*) AS c FROM post_signals WHERE user_id = ? AND client_signal IN ('approved','rejected','edited')`).get(uid).c;

  res.json({
    week: {
      key: curWeek,
      start: curWeek,
      end: shiftDays(curWeek, 6),
      planned: ppw,
      ready,
      missing: Math.max(0, ppw - ready),
      by_status: byStatus,
      posts: weekPosts.map((p) => ({
        id: p.id, image_path: p.image_path, caption: p.caption, hashtags: p.hashtags,
        scheduled_at: p.scheduled_at, published_at: p.published_at, status: p.status,
        media_type: p.media_type, ig_permalink: p.ig_permalink, signal: sigMap[p.id] || null,
      })),
    },
    approval: {
      approved, edited, rejected, total: sigTotal,
      approved_rate: sigTotal ? Math.round((approved / sigTotal) * 100) : null,
    },
    weekly,
    month: {
      key: mk,
      published: monthPublished,
      scheduled: monthScheduled,
      hours_saved: Math.round(monthPublished * 1.5 * 10) / 10, // estimado: ~1,5 h por posteo hecho a mano
      hours_saved_total: Math.round(totalPublished * 1.5 * 10) / 10,
    },
    taste_learned: tasteLearned,
  });
});

// Reinicio total: marca (logo, colores, nombre) + posteos pendientes (borradores,
// programados, en publicación). El historial publicado no se toca.
// Se usa al cambiar de cuenta de IG conectada y en el botón manual "Reiniciar todo".
function fullBrandReset(userId) {
  try {
    const logos = db.prepare(`SELECT * FROM assets WHERE user_id=? AND kind='logo'`).all(userId);
    for (const l of logos) { try { fs.unlinkSync(path.join(MEDIA_DIR, path.basename(l.file_path))); } catch (_) {} }
    db.prepare(`DELETE FROM assets WHERE user_id=? AND kind='logo'`).run(userId);
    db.prepare(`UPDATE settings SET brand_colors='', updated_at=datetime('now') WHERE user_id=?`).run(userId);
    db.prepare(`UPDATE profiles SET business_name='' WHERE user_id=?`).run(userId);
    db.prepare(`DELETE FROM posts WHERE user_id=? AND status IN ('draft','scheduled','publishing')`).run(userId);
  } catch (e) { console.error('[brand-reset]', e.message); }
}

// ---------- Instagram OAuth (Instagram Login / Business Login) ----------
// Avatar de un usuario de Instagram (og:image público, con caché de 30 días)
app.get('/api/ig/avatar', requireAuth, async (req, res) => {
  const u = String(req.query.u || '').trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9._]{1,30}$/.test(u)) return res.status(400).json({ error: 'Usuario inválido' });
  try {
    const cached = db.prepare("SELECT pic_url, name FROM ig_avatar_cache WHERE username=? AND fetched_at > datetime('now','-30 days')").get(u);
    if (cached && cached.pic_url) return res.json({ username: u, pic_url: cached.pic_url, name: cached.name });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    let html = '';
    try {
      const r = await fetch('https://www.instagram.com/' + encodeURIComponent(u) + '/', {
        signal: ctl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
      });
      html = await r.text();
    } finally { clearTimeout(t); }
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    const t2 = html.match(/<meta property="og:title" content="([^"]+)"/);
    let pic = m ? m[1].replace(/&amp;/g, '&') : null;
    // solo avatares reales (scontent); si IG sirvió el muro de login, no cachear
    if (pic && !/scontent[^/]*\.cdninstagram\.com\/v\//.test(pic)) pic = null;
    const nm = t2 ? t2[1].replace(/&amp;/g, '&').split(' on Instagram')[0].split(' • ')[0] : '';
    if (pic) db.prepare('INSERT OR REPLACE INTO ig_avatar_cache (username, pic_url, name, fetched_at) VALUES (?,?,?,datetime(\'now\'))').run(u, pic, nm);
    res.json({ username: u, pic_url: pic, name: nm });
  } catch (e) { res.json({ username: u, pic_url: null }); }
});
// Prepara el OAuth de Instagram: valida la Embed URL, guarda state en sesión
// y devuelve la URL de autorización de Meta.
// IMPORTANTE iOS: el frontend NO navega directo a instagram.com (iOS lo sacaría
// a la app de Instagram y el regreso a Posta se pierde). En su lugar va a
// /api/ig/go, que hace 302 al authorize: los universal links solo actúan en taps
// del usuario, no en redirects del servidor, así el ida y vuelta queda en Safari
// y vuelve solo a Posta. Vale también para desktop.
function buildIgAuth(req) {
  const s = getSettings(req.session.userId);
  const embedUrl = s.ig_embed_url || process.env.META_IG_EMBED_URL || process.env.IG_EMBED_URL;
  if (!embedUrl)
    return { error: 'Configurá tu Instagram Embed URL en Ajustes' };
  // redirect_uri para el intercambio del code: el de la Embed URL, o el de este host
  let redirectUri = '';
  try {
    redirectUri = new URL(embedUrl).searchParams.get('redirect_uri') || '';
  } catch (e) { /* url inválida, se usa el fallback */ }
  if (!redirectUri) {
    const host = req.get('host');
    redirectUri = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}/api/ig/callback`;
  }
  // La redirect_uri tiene que volver a Posta: si apunta a otro lado,
  // Instagram nunca regresa y el usuario "se queda en Instagram".
  try {
    const ru = new URL(redirectUri);
    const thisHost = req.get('host');
    if (ru.host !== thisHost) {
      return { error: `Tu Embed URL redirige a ${ru.host}, pero tiene que volver a Posta. En el dashboard de Meta \u2192 tu app \u2192 caso de uso Instagram \u2192 "API setup with Instagram login", pon\u00e9 como redirect URI: https://${thisHost}/api/ig/callback` };
    }
  } catch (e) {
    return { error: 'La Embed URL no es válida. Revisala en Ajustes \u2192 Integraciones.' };
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.igState = state;
  req.session.igRedirect = redirectUri;
  // Destino post-conexión (solo rutas internas de la app, anti open-redirect)
  const nx = String(req.query.next || '');
  if (/^\/#\/[^\s"'\\<>]*$/.test(nx)) req.session.igNext = nx;
  else delete req.session.igNext;
  return { url: getAuthUrl(embedUrl, state) };
}
app.get('/api/ig/start', requireAuth, (req, res) => {
  const r = buildIgAuth(req);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ url: r.url });
});
// Bounce del OAuth: el navegador llega a instagram.com vía 302 del servidor
// (no saca a la app de Instagram) y el callback vuelve solo a Posta.
app.get('/api/ig/go', requireAuth, (req, res) => {
  const r = buildIgAuth(req);
  if (r.error) {
    const safe = String(r.error).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return res.status(400).send(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:system-ui;padding:32px;text-align:center"><h2>No se pudo iniciar la conexión</h2><p>${safe}</p><p><a href="/#/app/ajustes">\u2190 Volver a Posta</a></p></body></html>`);
  }
  // Marca el intento: si Instagram deja al usuario varado en el feed (login +
  // verificación que pierde el contexto OAuth), al volver a Posta mostramos el
  // banner 'terminar de conectar' (ig_pending) por 15 minutos.
  req.session.igAttemptAt = Date.now();
  res.redirect(r.url);
});

app.get('/api/ig/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  // Destino post-OAuth: si el flujo empezó en una pantalla con ?next=, volvemos ahí
  const igDest = () => {
    const n = req.session.igNext;
    delete req.session.igNext;
    return (typeof n === 'string' && /^\/#\/[^\s"'\\<>]*$/.test(n)) ? n : '/#/app/ajustes';
  };
  const withQs = (base, qs) => base + (base.includes('?') ? '&' : '?') + qs;
  // Meta puede redirigir con error (permiso denegado, rol insuficiente, etc.)
  if (error) {
    const msg = /access_denied|user_denied/i.test(error)
      ? 'Denegaste el acceso a Instagram. Probá de nuevo y tocá "Permitir".'
      : (error_description || error);
    return res.redirect(withQs(igDest(), 'ig=error&msg=' + encodeURIComponent(msg)));
  }
  if (!req.session.userId || state !== req.session.igState) return res.status(400).send('Estado inválido');
  try {
    const s = getSettings(req.session.userId);
    const appId = s.meta_app_id || process.env.IG_APP_ID || process.env.META_APP_ID;
    const appSecret = s.meta_app_secret || process.env.IG_APP_SECRET || process.env.META_APP_SECRET;
    const { accessToken, igUserId } = await exchangeCodeForTokens(
      appId,
      appSecret,
      req.session.igRedirect,
      code
    );
    let username = '', accountType = '', finalIgId = igUserId;
    try {
      const prof = await getIgProfile(igUserId, accessToken);
      username = prof.username; accountType = prof.accountType;
      if (prof.userId) finalIgId = prof.userId;
    } catch (e) { console.error('[ig/callback] getIgProfile:', e.message); }
    // Solo las cuentas profesionales (Business/Creator) pueden publicar vía API
    if (/personal/i.test(accountType || '')) {
      return res.redirect(withQs(igDest(), 'ig=personal'));
    }
    // Un Instagram = una sola cuenta ACTIVA a la vez en Posta
    const dupe = finalIgId ? db.prepare(`SELECT user_id FROM settings WHERE ig_user_id = ? AND user_id != ?`).get(finalIgId, req.session.userId) : null;
    if (dupe) {
      return res.redirect(withQs(igDest(), 'ig=error&msg=' + encodeURIComponent('Esta cuenta de Instagram ya está vinculada a otra cuenta de Posta.')));
    }
    // Si el IG se usó antes en otra cuenta pero ya no está conectado a nadie
    // (el dupe-check de arriba lo garantiza), se permite la transferencia y el
    // registro pasa al nuevo dueño. La prueba gratis sigue siendo por usuario.
    const usedBefore = finalIgId ? db.prepare(`SELECT first_user_id FROM ig_registry WHERE ig_user_id = ?`).get(finalIgId) : null;
    if (usedBefore && usedBefore.first_user_id !== req.session.userId) {
      db.prepare(`UPDATE ig_registry SET first_user_id = ?, first_seen_at = datetime('now') WHERE ig_user_id = ?`).run(req.session.userId, finalIgId);
    }
    const s0 = getSettings(req.session.userId);
    const wasDemo = !!s0.demo_mode;
    const prevIgId = String(s0.ig_user_id || s0.last_ig_user_id || '');
    db.prepare(
      `UPDATE settings SET ig_user_id=?, ig_page_id='', ig_access_token=?, ig_token_issued_at=datetime('now'), ig_token_warning=0, demo_mode=0, updated_at=datetime('now') WHERE user_id=?`
    ).run(finalIgId, accessToken, req.session.userId);
    // Si cambió la cuenta de IG: la marca y los posteos pendientes eran de otro negocio → reset total
    let brandReset = false;
    if (prevIgId && finalIgId && prevIgId !== String(finalIgId)) {
      fullBrandReset(req.session.userId);
      db.prepare(`UPDATE settings SET last_ig_user_id='' WHERE user_id=?`).run(req.session.userId);
      brandReset = true;
    }
    // Registro permanente del uso (sobrevive a desconexiones)
    try {
      db.prepare(`INSERT OR IGNORE INTO ig_registry (ig_user_id, first_user_id) VALUES (?, ?)`).run(finalIgId, req.session.userId);
    } catch (e) { /* no bloquea la conexión */ }
    db.prepare(`UPDATE profiles SET ig_username=?, ig_connected=1 WHERE user_id=?`).run(username, req.session.userId);
    // Análisis de su Instagram en background: la IA los conoce desde el día uno. Nunca bloquea la conexión.
    try {
      const { analyzeInstagram } = require('./instagram');
      analyzeInstagram(finalIgId, accessToken)
        .then(r => {
          if (r && r.summary) {
            try {
              db.prepare(`INSERT INTO ig_analysis (user_id, summary, updated_at) VALUES (?, ?, datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET summary=excluded.summary, updated_at=datetime('now')`)
                .run(req.session.userId, String(r.summary).slice(0, 4000));
            } catch (e) { console.error('[ig] analysis save:', e.message); }
          }
        })
        .catch(e => console.error('[ig] analyze:', e.message));
    } catch (e) { console.error('[ig] analyze:', e.message); }
    track(req.session.userId, 'ig_connected');
    delete req.session.igAttemptAt; // conectado: no más banner pendiente
    res.redirect(withQs(igDest(), 'ig=ok' + (wasDemo ? '&demo_off=1' : '') + (brandReset ? '&brand_reset=1' : '')));
  } catch (e) {
    res.redirect(withQs(igDest(), 'ig=error&msg=' + encodeURIComponent(e.message)));
  }
});

// Relee el perfil de IG con el token guardado (rellena el username si quedó vacío)
app.get('/api/ig/sync', requireAuth, async (req, res) => {
  try {
    const s = getSettings(req.session.userId);
    if (!s.ig_user_id || !s.ig_access_token) return res.status(400).json({ error: 'Sin cuenta conectada' });
    const prof = await getIgProfile(s.ig_user_id, s.ig_access_token);
    if (prof.userId && prof.userId !== s.ig_user_id) {
      db.prepare(`UPDATE settings SET ig_user_id=? WHERE user_id=?`).run(prof.userId, req.session.userId);
    }
    db.prepare(`UPDATE profiles SET ig_username=?, ig_connected=1 WHERE user_id=?`).run(prof.username, req.session.userId);
    res.json({ ok: true, username: prof.username, accountType: prof.accountType });
  } catch (e) {
    console.error('[ig/sync]:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/ig/disconnect', requireAuth, (req, res) => {
  // Guardamos cuál IG estaba conectado: si después conecta otro distinto, se detecta
  // el cambio y se reinician marca + posteos pendientes (eran de otro negocio).
  db.prepare(`UPDATE settings SET last_ig_user_id=ig_user_id, ig_user_id='', ig_page_id='', ig_access_token='' WHERE user_id=?`).run(req.session.userId);
  db.prepare(`UPDATE profiles SET ig_connected=0 WHERE user_id=?`).run(req.session.userId);
  res.json({ ok: true });
});

// Reinicio manual total (marca + posteos pendientes). El historial publicado no se toca.
app.post('/api/brand/reset', requireAuth, (req, res) => {
  fullBrandReset(req.session.userId);
  res.json({ ok: true });
});

// ---------- Eliminación de datos (requerido por Meta App Review) ----------
// Meta envía un POST form-encoded con `signed_request` cuando un usuario pide borrar sus datos.
function parseMetaSignedRequest(signedRequest, secret) {
  try {
    const parts = String(signedRequest || '').split('.');
    if (parts.length !== 2 || !secret) return null;
    const [sigB64u, payloadB64u] = parts;
    const b64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const sig = b64(sigB64u);
    const expected = crypto.createHmac('sha256', secret).update(payloadB64u).digest();
    if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
    return JSON.parse(b64(payloadB64u).toString('utf8'));
  } catch (e) { return null; }
}

app.post('/api/data-deletion', express.urlencoded({ extended: false }), (req, res) => {
  const data = parseMetaSignedRequest(req.body.signed_request, process.env.META_APP_SECRET);
  if (!data) return res.status(400).json({ error: 'signed_request inválido' });
  const metaUserId = String(data.user_id || '');
  try {
    const s = metaUserId ? db.prepare('SELECT user_id FROM settings WHERE ig_user_id = ?').get(metaUserId) : null;
    if (s) {
      const uid = s.user_id;
      db.prepare('DELETE FROM posts WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM assets WHERE user_id = ?').run(uid);
      db.prepare(`UPDATE settings SET ig_user_id='', ig_page_id='', ig_access_token='' WHERE user_id=?`).run(uid);
      db.prepare('UPDATE profiles SET ig_username=NULL, ig_connected=0 WHERE user_id=?').run(uid);
    }
  } catch (e) { /* no bloquea la confirmación */ }
  const code = crypto.randomBytes(8).toString('hex');
  try { db.prepare('INSERT INTO deletion_requests (code, meta_user_id, status) VALUES (?, ?, ?)').run(code, metaUserId, 'done'); } catch (e) {}
  const base = 'https://' + req.get('host');
  res.json({ url: base + '/api/data-deletion/status?code=' + code, confirmation_code: code });
});

app.get('/api/data-deletion/status', (req, res) => {
  const r = db.prepare('SELECT code, status, created_at FROM deletion_requests WHERE code = ?').get(String(req.query.code || ''));
  if (!r) return res.status(404).json({ error: 'código no encontrado' });
  res.json({ confirmation_code: r.code, status: r.status, deleted_at: r.created_at });
});

// ---------- Config pública (landing, CTAs) ----------
app.get('/api/config', (req, res) => {
  res.json({
    mp_configured: mp.mpConfigured(),
  });
});

// Diagnóstico: ¿puede este servidor llegar a la API de MercadoPago?
// (endpoint público e inofensivo: solo devuelve estado y latencia)
app.get('/api/billing/mp-ping', async (req, res) => {
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.mercadopago.com/v1/payment_methods', {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN || ''}` },
      signal: AbortSignal.timeout(15000),
    });
    res.json({ ok: r.ok, status: r.status, ms: Date.now() - t0 });
  } catch (e) {
    res.json({ ok: false, error: e.name + ': ' + e.message, ms: Date.now() - t0 });
  }
});

// ---------- Referidos: 2 amigos activos = 50% off ----------
const REFERRALS_NEEDED = 2;
const REFERRAL_DISCOUNT = 0.5;
const FRIEND_DISCOUNT = 0.8; // invitado con link de referido: 20% off

function newReferralCode() {
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex');
    if (!db.prepare('SELECT id FROM users WHERE referral_code = ?').get(code)) return code;
  }
  return crypto.randomBytes(8).toString('hex');
}

// Cuenta referidos con suscripción ACTIVA (si cancelan, el descuento se pierde)
function referralStats(userId) {
  const me = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(userId);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND plan_status = 'active'`).get(userId);
  const referred_count = row ? row.n : 0;
  return { code: me ? me.referral_code : '', referred_count, needed: REFERRALS_NEEDED, discount_active: referred_count >= REFERRALS_NEEDED };
}

// ---------- Facturación (Mercado Pago) ----------
app.get('/api/billing/plans', (req, res) => {
  const country = req.query.country === 'UY' ? 'UY' : 'AR';
  const plans = getPlans(country);
  const anchor = PLAN_ANCHOR[country];
  res.json({
    country,
    currency: country === 'UY' ? 'UYU' : 'ARS',
    plans: Object.values(plans).map((p) => ({ ...p, price_label: formatPrice(p) })),
    anchor,
    trial_plan: TRIAL_PLAN,
    mp_configured: mp.mpConfigured(),
  });
});

// ---------- Cuenta gratis (fundador / cortesías) ----------
// Solo con la llave del dueño (TRIAL_TEST_KEY, vive en Railway). Otorga el plan
// "free": límites del Total, sin MercadoPago, sin vencimiento.
app.all('/api/admin/grant-free', (req, res) => {
  const k = process.env.TRIAL_TEST_KEY || '';
  const given = String((req.query && req.query.test_key) || (req.body && req.body.test_key) || '');
  if (!k || given !== k) return res.status(403).json({ error: 'No autorizado' });
  const email = String((req.body && req.body.email) || (req.query && req.query.email) || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) return res.status(404).json({ error: 'Ese email no tiene cuenta en Posta' });
  db.prepare(`UPDATE users SET plan='free', plan_status='active', email_verified=1 WHERE id=?`).run(u.id);
  db.prepare('DELETE FROM email_tokens WHERE user_id = ?').run(u.id);
  console.log(`[posta] cuenta gratis otorgada a ${email}`);
  res.json({ ok: true, email });
});

app.post('/api/billing/subscribe', requireAuth, async (req, res) => {
  const { plan: planId, country, payer_email } = req.body || {};
  const plans = getPlans(country === 'UY' ? 'UY' : 'AR');
  const plan = plans[planId];
  if (!plan) return res.status(400).json({ error: 'Plan inválido' });
  if (!mp.mpConfigured()) {
    return res.status(400).json({ error: 'Pagos no configurados todavía.' });
  }
  const payerEmail = String(payer_email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return res.status(400).json({ error: 'Ingresá el email de tu cuenta de MercadoPago.' });
  }
  try {
    const user = db.prepare('SELECT id, email, plan_status, mp_preapproval_id, referred_by, email_verified FROM users WHERE id = ?').get(req.session.userId);
    if (user.plan_status === 'active' && user.mp_preapproval_id) {
      return res.status(400).json({ error: 'Ya tenés una suscripción activa. Si querés cambiar de plan, primero cancelá la actual desde Mi plan.' });
    }
    // Sin bloqueo por email sin verificar: si quiere pagar, que pague.
    // MercadoPago ya valida al comprador en su checkout.
    // Guardar el email de MP para pre-completarlo la próxima vez
    try { db.prepare(`UPDATE users SET mp_payer_email=? WHERE id=?`).run(payerEmail, user.id); } catch (e) {}
    const host = req.get('host') || ''; const baseUrl = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
    // Descuento por referidos: 2 amigos con suscripción activa = 50% off (tiene prioridad);
    // si no, invitado con link = 20% off
    let finalPlan = plan;
    let discount = false;
    let mult = 1;
    if (referralStats(user.id).discount_active) {
      discount = true;
      mult = REFERRAL_DISCOUNT;
      finalPlan = { ...plan, price: Math.round(plan.price * REFERRAL_DISCOUNT), name: `${plan.name} (50% off referidos)` };
    } else if (user.referred_by) {
      discount = true;
      mult = FRIEND_DISCOUNT;
      finalPlan = { ...plan, price: Math.round(plan.price * FRIEND_DISCOUNT), name: `${plan.name} (20% off invitado)` };
    }
    const { init_point } = await mp.createSubscription({
      plan: finalPlan,
      userId: user.id,
      baseUrl,
      payerEmail,
    });
    // Guardar base y multiplicador para la conciliación automática con MP
    try { db.prepare(`UPDATE users SET mp_base_amount = ?, mp_mult = ? WHERE id = ?`).run(plan.price, mult, user.id); } catch (e) {}
    res.json({ init_point, discount_applied: discount });
  } catch (e) {
    console.error('[posta] Error creando suscripción MP:', e.message);
    res.status(500).json({ error: 'No se pudo iniciar el pago: ' + e.message });
  }
});

// Webhook de Mercado Pago: valida la suscripción y activa/cancela el plan.
// Soporta ?topic=preapproval&id=... y body {type:'preapproval', data:{id}}.
app.post('/api/billing/webhook', async (req, res) => {
  const topic = req.query.topic || req.query.type || (req.body && req.body.type);
  const mpId = req.query.id || (req.body && req.body.data && req.body.data.id);
  if (!mp.mpConfigured()) {
    console.log('[posta] Webhook MP recibido pero MP_ACCESS_TOKEN no está configurado. Se ignora.');
    return res.status(200).json({ ok: false, warning: 'MP no configurado' });
  }
  if (topic !== 'preapproval' || !mpId) {
    return res.status(200).json({ ok: true, ignored: true });
  }
  try {
    const sub = await mp.getSubscription(mpId);
    const [userId, planId] = String(sub.external_reference || '').split(':');
    if (!userId || !PLANS[planId]) {
      console.log(`[posta] Webhook MP: external_reference inválido (${sub.external_reference})`);
      return res.status(200).json({ ok: true, ignored: true });
    }
    if (sub.status === 'authorized') {
      db.prepare(`UPDATE users SET plan=?, plan_status='active', mp_preapproval_id=? WHERE id=?`)
        .run(planId, String(mpId), Number(userId));
      track(Number(userId), 'subscribed', planId);
      console.log(`[posta] ✅ Plan ${planId} activado para el usuario ${userId} (MP ${mpId})`);
    } else if (['cancelled', 'paused'].includes(sub.status)) {
      db.prepare(`UPDATE users SET plan_status='cancelled' WHERE id=? AND mp_preapproval_id=?`)
        .run(Number(userId), String(mpId));
      console.log(`[posta] Plan cancelado para el usuario ${userId} (MP ${mpId}, estado ${sub.status})`);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[posta] Webhook MP falló:', e.message);
    res.status(200).json({ ok: false, error: 'retry' });
  }
});

app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT plan, mp_preapproval_id FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.plan === 'free') return res.status(400).json({ error: 'Esta cuenta es de cortesía y no necesita cancelación.' });
  if (user && user.mp_preapproval_id && mp.mpConfigured()) {
    try {
      await mp.cancelSubscription(user.mp_preapproval_id);
    } catch (e) {
      console.error('[posta] No se pudo cancelar en MP:', e.message);
      return res.status(500).json({ error: 'No pudimos cancelar tu suscripción en Mercado Pago. Probá de nuevo en unos minutos.' });
    }
  }
  db.prepare(`UPDATE users SET plan_status='cancelled', mp_preapproval_id=NULL WHERE id=?`).run(req.session.userId);
  res.json({ ok: true });
});

// ---------- Referidos ----------
app.get('/api/referrals/mine', requireAuth, (req, res) => {
  const s = referralStats(req.session.userId);
  const me = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(req.session.userId);
  const host = req.get('host') || ''; const baseUrl = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  let joined = [];
  try {
    joined = db.prepare(`SELECT COALESCE(NULLIF(p.business_name, ''), 'Un referido') AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.referred_by = ? AND u.plan_status = 'active' ORDER BY u.id DESC`).all(req.session.userId).map(r => r.name);
  } catch (e) {}
  // En camino: se registraron con el link pero todavía no se suscribieron (siguen en trial)
  let pending = [];
  try {
    const nowMs = Date.now();
    pending = db.prepare(`SELECT COALESCE(NULLIF(p.business_name, ''), 'Un referido') AS name, u.trial_ends_at AS trial_ends_at FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.referred_by = ? AND u.plan_status = 'trial' AND (u.trial_ends_at IS NULL OR u.trial_ends_at > ?) ORDER BY u.id DESC`).all(req.session.userId, nowMs)
      .map(r => ({ name: r.name, days_left: (r.trial_ends_at && r.trial_ends_at > nowMs) ? Math.ceil((r.trial_ends_at - nowMs) / 86400000) : 0 }));
  } catch (e) {}
  res.json({ ok: true, code: s.code, link: `${baseUrl}/?ref=${s.code}`, referred_count: s.referred_count, needed: s.needed, discount_active: s.discount_active, invited: !!(me && me.referred_by), joined, pending });
  // Si los referidos cambiaron desde la suscripción, sincronizar el monto con MP (no bloquea)
  reconcileUser(db, req.session.userId).catch(() => {});
});

// Festejo de primera publicación: el momento donde la confianza se cristaliza.
// Devuelve el primer posteo publicado si el usuario todavía no lo celebró.
app.get('/api/publish-celebration', requireAuth, (req, res) => {
  const me = db.prepare('SELECT COALESCE(publish_celebrated, 0) AS pc FROM users WHERE id = ?').get(req.session.userId);
  if (me && me.pc) return res.json({ ok: true, show: false });
  const first = db.prepare(
    `SELECT id, caption, hashtags, media_type, image_path, ig_permalink, published_at
     FROM posts WHERE user_id = ? AND status = 'published' ORDER BY published_at ASC, id ASC LIMIT 1`
  ).get(req.session.userId);
  if (!first) return res.json({ ok: true, show: false });
  res.json({ ok: true, show: true, post: first });
});
app.post('/api/publish-celebration/seen', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET publish_celebrated = 1 WHERE id = ?').run(req.session.userId);
  res.json({ ok: true });
});

// Hitos de publicaciones: 10, 25, 50, 100 (el hito 1 lo cubre /api/publish-celebration).
const MILESTONES = [10, 25, 50, 100];
app.get('/api/milestones', requireAuth, (req, res) => {
  const seen = db.prepare('SELECT milestone FROM milestones_seen WHERE user_id = ?').all(req.session.userId).map(r => r.milestone);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'`).get(req.session.userId).c;
  const hit = MILESTONES.find(m => total >= m && !seen.includes(m));
  res.json({ ok: true, show: !!hit, milestone: hit || null, total });
});
app.post('/api/milestones/seen', requireAuth, (req, res) => {
  const m = Number(req.body && req.body.milestone);
  if (MILESTONES.includes(m)) db.prepare('INSERT OR IGNORE INTO milestones_seen (user_id, milestone) VALUES (?, ?)').run(req.session.userId, m);
  res.json({ ok: true });
});

// Sugerencias proactivas del CM: detecta patrones y propone (máx 2).
app.get('/api/proactive-tips', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const tips = [];
    // (a) Sin promo hace 3+ semanas
    const totalPub = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'`).get(uid).c;
    const lastPromo = db.prepare(`SELECT published_at FROM posts WHERE user_id = ? AND tipo = 'promo' AND status = 'published' ORDER BY published_at DESC LIMIT 1`).get(uid);
    if (lastPromo && lastPromo.published_at) {
      const days = (Date.now() - new Date(lastPromo.published_at).getTime()) / 86400000;
      if (days >= 21) {
        const weeks = Math.floor(days / 7);
        tips.push({ icon: '💡', text: `Hace ${weeks} semanas no hacés una promo — ¿armamos una?` });
      }
    } else if (totalPub >= 3) {
      tips.push({ icon: '💡', text: 'Todavía no probaste una promo — ¿armamos una?' });
    }
    // (b) Formato con mejor alcance promedio (últimos 30 días, mín 2 posteos por formato)
    if (tips.length < 2) {
      const rows = db.prepare(`
        SELECT p.media_type AS mt, AVG(m.reach) AS avg_reach, COUNT(*) AS n
        FROM post_metrics m JOIN posts p ON p.id = m.post_id
        WHERE p.user_id = ? AND p.status = 'published' AND p.published_at >= datetime('now', '-30 days') AND m.reach > 0
        GROUP BY p.media_type HAVING COUNT(*) >= 2
        ORDER BY avg_reach DESC
      `).all(uid);
      if (rows.length >= 2) {
        const restAvg = rows.slice(1).reduce((s, r) => s + r.avg_reach, 0) / (rows.length - 1);
        if (restAvg > 0) {
          const x = rows[0].avg_reach / restAvg;
          if (x >= 1.5) {
            const fmtName = rows[0].mt === 'carousel' ? 'carruseles' : rows[0].mt === 'video' ? 'reels' : 'posteos con foto';
            tips.push({ icon: '🔥', text: `Tus ${fmtName} rinden ${x.toFixed(1).replace('.', ',')}x más que el resto — ¿repetimos la fórmula?` });
          }
        }
      }
    }
    // (c) Tipo muy rechazado sin señales positivas: sugerir pausarlo
    if (tips.length < 2) {
      try {
        const rej = db.prepare(`
          SELECT p.tipo AS tipo, COUNT(*) AS n
          FROM post_signals s JOIN posts p ON p.id = s.post_id
          WHERE s.user_id = ? AND s.client_signal = 'rejected' AND s.updated_at >= datetime('now', '-30 days')
            AND p.tipo != '' AND p.user_id = ?
          GROUP BY p.tipo HAVING COUNT(*) >= 3
        `).all(uid, uid);
        const paused = pausedTipos(uid);
        for (const r of rej) {
          if (!TIPOS_VALIDOS.includes(r.tipo) || paused[r.tipo]) continue;
          const good = db.prepare(`
            SELECT COUNT(*) AS c FROM post_signals s JOIN posts p ON p.id = s.post_id
            WHERE s.user_id = ? AND s.client_signal IN ('edited','approved') AND s.updated_at >= datetime('now', '-30 days')
              AND p.tipo = ? AND p.user_id = ?
          `).get(uid, r.tipo, uid).c;
          if (!good) {
            const pl = TIPO_PLURAL[r.tipo] || r.tipo;
            const seg = (r.tipo === 'promo' || r.tipo === 'novedad') ? 'seguidas' : 'seguidos';
            tips.push({ icon: '🚫', kind: 'pause-tipo', tipo: r.tipo, text: `Rechazaste ${r.n} ${pl} ${seg}. ¿Los pauso un tiempo?` });
            break;
          }
        }
      } catch (e) {}
    }
    res.json({ ok: true, tips: tips.slice(0, 2) });
  } catch (e) {
    console.error('[proactive-tips]', e.message);
    res.json({ ok: true, tips: [] });
  }
});

/* ---------- Plan semanal sugerido: mix de tipos con su porqué ---------- */
const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function buildWeeklyPlan(uid) {
  const plan = [];
  const used = new Set();
  const paused = pausedTipos(uid);
  const addTipo = (t, pq) => {
    if (used.has(t) || !t || paused[t]) return;
    used.add(t);
    plan.push({ tipo: t, por_que: pq });
  };
  // 0. Serie fija del cliente (si la activó): va primera.
  const dna = readDna(uid);
  const series = (dna && typeof dna.series === 'object' && dna.series) || null;
  if (series && series.nombre && TIPOS_VALIDOS.includes(series.tipo)) {
    const wd = parseInt(series.weekday, 10);
    const dia = DIAS_ES[(wd >= 0 && wd <= 6) ? wd : 1] || 'lunes';
    plan.push({ tipo: 'serie', serie_tipo: series.tipo, nombre: String(series.nombre).slice(0, 60), por_que: `tu serie de los ${dia}` });
  }
  // Pilares del mes (si existen)
  let pillars = [];
  try {
    const mk = new Date().toISOString().slice(0, 7);
    const cached = db.prepare('SELECT pillars_json FROM pillars_cache WHERE user_id = ? AND month_key = ?').get(uid, mk);
    if (cached && cached.pillars_json) pillars = JSON.parse(cached.pillars_json) || [];
  } catch (e) {}
  // Tipos usados en los últimos 7 días (para variar)
  let lastWeekTipos = [];
  try {
    lastWeekTipos = db.prepare(`SELECT tipo FROM posts WHERE user_id = ? AND tipo != '' AND status != 'cancelled' AND created_at >= datetime('now', '-7 days')`).all(uid).map(r => r.tipo);
  } catch (e) {}
  // ¿Falta una promo? (misma lógica que proactive-tips)
  let needPromo = false, promoWeeks = 0;
  try {
    const lastPromo = db.prepare(`SELECT COALESCE(published_at, created_at) AS d FROM posts WHERE user_id = ? AND tipo = 'promo' AND status != 'cancelled' ORDER BY d DESC LIMIT 1`).get(uid);
    if (lastPromo && lastPromo.d) {
      const days = (Date.now() - new Date(lastPromo.d).getTime()) / 86400000;
      if (days >= 21) { needPromo = true; promoWeeks = Math.floor(days / 7); }
    } else {
      const totalPub = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'`).get(uid).c;
      if (totalPub >= 3) needPromo = true;
    }
  } catch (e) {}
  // 1. Promo prioritaria si hace falta
  if (needPromo) addTipo('promo', promoWeeks > 0 ? `hace ${promoWeeks} semanas no hacés promo` : 'todavía no probaste una promo');
  // 2. Tipos ligados a los pilares del mes
  pillars.forEach(p => {
    if (plan.length >= 4) return;
    const s = `${p.titulo || ''} ${p.enfoque || ''}`.toLowerCase();
    let t = 'novedad';
    if (/promo|oferta|descuento|venta|precio|vender/.test(s)) t = 'promo';
    else if (/tip|consejo|educ|enseñ|gu[ií]a|aprende/.test(s)) t = 'tip';
    else if (/comunidad|cliente|testimonio|rese[ñn]a|confianza|opini/.test(s)) t = 'social';
    else if (/detr[aá]s|equipo|proceso|humano|historia|cocina|taller/.test(s)) t = 'detras';
    if (lastWeekTipos.includes(t)) return; // prefiere variar vs la semana pasada
    addTipo(t, `pilar del mes: ${p.titulo || 'contenido'}`);
  });
  // 3. Completa con variedad (defaults por tipo)
  const defaults = {
    tip: 'los tips te posicionan como referente',
    social: 'la prueba social genera confianza',
    detras: 'el detrás de escena humaniza tu marca',
    novedad: 'las novedades mantienen tu cuenta fresca',
    promo: 'las promos venden directo',
  };
  for (const t of ['tip', 'social', 'detras', 'novedad', 'promo']) {
    if (plan.length >= 4) break;
    if (!used.has(t)) addTipo(t, defaults[t]);
  }
  const out = plan.slice(0, 4);
  // 4. Sin serie pero con historial (3+ semanas): sugerir activar una.
  if (!series) {
    try {
      const w = db.prepare(`SELECT COUNT(DISTINCT strftime('%Y-%W', published_at)) AS w FROM posts WHERE user_id = ? AND status = 'published' AND published_at IS NOT NULL`).get(uid);
      if (w && w.w >= 3) {
        out.push({ kind: 'suggest-serie', nombre_sugerido: 'El tip del lunes', tipo: 'tip', weekday: 1, texto: 'Ya tenés constancia: una serie fija como "El tip del lunes" crea hábito en tu audiencia. ¿La activamos?' });
      }
    } catch (e) {}
  }
  return out;
}
app.get('/api/weekly-plan', requireAuth, (req, res) => {
  try {
    res.json({ ok: true, plan: buildWeeklyPlan(req.session.userId) });
  } catch (e) {
    console.error('[weekly-plan]', e.message);
    res.json({ ok: true, plan: [] });
  }
});

/* ---------- Alerta honesta: el alcance cayó ≥40% semana contra semana ---------- */
app.get('/api/performance-alert', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const avgFor = (d0, d1) => db.prepare(`
      SELECT AVG(m.reach) AS avg_reach, COUNT(*) AS n
      FROM post_metrics m JOIN posts p ON p.id = m.post_id
      WHERE p.user_id = ? AND p.status = 'published' AND m.reach > 0
        AND p.published_at >= datetime('now', ?) AND p.published_at < datetime('now', ?)
    `).get(uid, `-${d0} days`, d1 === 0 ? '+1 day' : `-${d1} days`);
    const cur = avgFor(7, 0);
    const prev = avgFor(14, 7);
    if (!cur || cur.n < 2 || !prev || prev.n < 2 || !prev.avg_reach || prev.avg_reach <= 0) {
      return res.json({ ok: true, alert: false });
    }
    const drop = (prev.avg_reach - cur.avg_reach) / prev.avg_reach;
    if (drop < 0.4) return res.json({ ok: true, alert: false });
    const dropPct = Math.round(drop * 100);
    let diagnostico = 'El alcance bajó en todos los formatos por igual.';
    let plan = 'Probamos hooks nuevos y un carrusel esta semana para reactivar.';
    try {
      const fmtFor = (d0, d1) => db.prepare(`
        SELECT p.media_type AS mt, AVG(m.reach) AS avg_reach, COUNT(*) AS n
        FROM post_metrics m JOIN posts p ON p.id = m.post_id
        WHERE p.user_id = ? AND p.status = 'published' AND m.reach > 0
          AND p.published_at >= datetime('now', ?) AND p.published_at < datetime('now', ?)
        GROUP BY p.media_type
      `).all(uid, `-${d0} days`, d1 === 0 ? '+1 day' : `-${d1} days`);
      const c = fmtFor(7, 0), p = fmtFor(14, 7);
      const fmtName = mt => mt === 'carousel' ? 'carruseles' : mt === 'video' ? 'reels' : mt === 'story' ? 'historias' : 'posteos con foto';
      let worst = null, worstDrop = 0;
      c.forEach(cr => {
        const pr = p.find(x => x.mt === cr.mt);
        if (pr && pr.avg_reach > 0) {
          const d = (pr.avg_reach - cr.avg_reach) / pr.avg_reach;
          if (d > worstDrop) { worstDrop = d; worst = cr.mt; }
        }
      });
      if (worst && worstDrop >= 0.3) {
        diagnostico = `Tus ${fmtName(worst)} cayeron ${Math.round(worstDrop * 100)}% en alcance.`;
        const best = c.slice().sort((a, b) => b.avg_reach - a.avg_reach)[0];
        plan = best && best.mt === worst
          ? `Esta semana los priorizamos con hooks más fuertes.`
          : `Esta semana priorizamos ${fmtName(best.mt)}, tu formato más fuerte ahora.`;
      } else if (cur.n < prev.n) {
        const diff = prev.n - cur.n;
        diagnostico = `Publicaste ${diff} ${diff === 1 ? 'posteo menos' : 'posteos menos'} que la semana anterior.`;
        plan = 'La constancia es lo que más pesa: esta semana la armamos completa.';
      }
    } catch (e) {}
    res.json({ ok: true, alert: true, dropPct, diagnostico, plan });
  } catch (e) {
    console.error('[performance-alert]', e.message);
    res.json({ ok: true, alert: false });
  }
});

/* ---------- Lista de fotos de la semana (director de fotografía) ---------- */
const SHOT_TEMPLATES = {
  promo: [
    { foto: 'Tu producto estrella en primer plano, sobre fondo liso y despejado', para: 'la promo de la semana', tip: 'Luz natural de costado (ventana): sacala de día, nunca con flash' },
    { foto: 'El producto en manos de alguien, en uso real', para: 'la promo de la semana', tip: 'Acercate: que el producto ocupe al menos la mitad del encuadre' },
  ],
  tip: [
    { foto: 'Una foto que ilustre el consejo: el antes/después, el detalle, el proceso', para: 'el tip de la semana', tip: 'Que la foto "explique" sola: si necesita texto para entenderse, no sirve' },
    { foto: 'Plano detalle de lo que estás enseñando (textura, paso a paso)', para: 'el tip de la semana', tip: 'Foco nítido en el detalle: tocá la pantalla para enfocar antes de disparar' },
  ],
  social: [
    { foto: 'Un cliente real usando tu producto o en tu local (con su permiso)', para: 'la prueba social', tip: 'Las caras venden: pedí permiso y sacala en el momento, no posada' },
    { foto: 'Captura de una reseña linda que te dejaron (WhatsApp, Google, IG)', para: 'la prueba social', tip: 'Recortá solo el mensaje: que se lea grande en el celular' },
  ],
  detras: [
    { foto: 'Tu equipo trabajando: manos en acción, el local en movimiento', para: 'el detrás de escena', tip: 'Fotos robadas, no posadas: dispará mientras trabajan de verdad' },
    { foto: 'Un rincón de tu lugar que los clientes no suelen ver', para: 'el detrás de escena', tip: 'Buscá la luz más linda del local y poné el detalle ahí' },
  ],
  novedad: [
    { foto: 'Lo nuevo: el producto, el cambio, lo que llegó esta semana', para: 'la novedad', tip: 'Presentación de "unboxing": que se note que es algo nuevo' },
    { foto: 'Vos o tu equipo presentando la novedad, mirando a cámara', para: 'la novedad', tip: 'Mirá al lente, no a la pantalla: conecta mucho más' },
  ],
  serie: [
    { foto: 'La foto protagonista de tu serie: simple, repetible cada semana', para: 'tu serie semanal', tip: 'Pensá en formato fijo: el mismo encuadre cada semana crea marca' },
  ],
};
async function personalizeShots(shots, profile, apiKey) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Sos director de fotografía de un community manager. Personalizá la lista de fotos para el negocio indicado. Respondé SOLO JSON: {"shots":[{"foto":"...","para":"...","tip":"..."}]}. "foto": qué fotografiar, concreto y posible con un celular. "para": para qué posteo es. "tip": un consejo de luz o encuadre. Español rioplatense, una línea por campo.' },
          { role: 'user', content: `Negocio: ${profile.business_name || ''} (${profile.category || ''}). ${profile.description || ''}\nFotos pedidas:\n${shots.map((s, i) => `${i + 1}. ${s.foto} — para: ${s.para}`).join('\n')}` },
        ],
        max_tokens: 700, temperature: 0.7,
      }),
    });
    const j = await r.json();
    const txt = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
    const mm = txt.match(/\{[\s\S]*\}/);
    if (mm) {
      const p = JSON.parse(mm[0]);
      if (Array.isArray(p.shots) && p.shots.length) {
        return p.shots.slice(0, 3).map(s => ({
          foto: String((s && s.foto) || '').slice(0, 200) || 'Foto del negocio',
          para: String((s && s.para) || '').slice(0, 120),
          tip: String((s && s.tip) || '').slice(0, 200),
        })).filter(s => s.foto && s.para);
      }
    }
  } catch (e) {}
  return shots;
}
async function getShotsForWeek(uid) {
  const plan = buildWeeklyPlan(uid);
  const shots = [];
  const usedTipos = new Set();
  const take = (t, nombre) => {
    const tpl = SHOT_TEMPLATES[t] || SHOT_TEMPLATES.novedad;
    const s = tpl[shots.length % tpl.length];
    shots.push(t === 'serie'
      ? { foto: s.foto, para: `tu serie "${nombre || 'semanal'}"`, tip: s.tip }
      : { foto: s.foto, para: s.para, tip: s.tip });
    usedTipos.add(t);
  };
  for (const it of plan) {
    if (shots.length >= 3) break;
    const t = it.tipo;
    if (t !== 'serie' && !TIPOS_VALIDOS.includes(t)) continue;
    if (usedTipos.has(t)) continue;
    take(t, it.nombre);
  }
  for (const t of TIPOS_VALIDOS) {
    if (shots.length >= 3) break;
    if (!usedTipos.has(t)) take(t);
  }
  const key = getSettings(uid).openai_key || process.env.OPENAI_API_KEY || '';
  return key ? await personalizeShots(shots.slice(0, 3), getProfile(uid), key) : shots.slice(0, 3);
}
app.get('/api/shot-list', requireAuth, async (req, res) => {
  try {
    res.json({ ok: true, shots: await getShotsForWeek(req.session.userId) });
  } catch (e) {
    console.error('[shot-list]', e.message);
    res.json({ ok: true, shots: [] });
  }
});
// La IA pide las fotos POR CHAT (como un amigo), no con tarjetas. 1 vez cada 7 días.
app.post('/api/proactive-shot-ask', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const recent = db.prepare(`SELECT 1 FROM proactive_asks WHERE user_id = ? AND kind = 'fotos' AND created_at >= datetime('now', '-7 days')`).get(uid);
    if (recent) return res.json({ ok: true, asked: false });
    const shots = await getShotsForWeek(uid);
    if (!shots.length) return res.json({ ok: true, asked: false });
    const lines = shots.slice(0, 3).map(s => `📸 ${String(s.foto || '').slice(0, 90)}`);
    const msg = `¡Tu semana está armada! 🙌\nPara dejarla impecable con fotos reales, ¿me conseguís estas?\n${lines.join('\n')}\nMandamelas por acá cuando las tengas 👇`;
    db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)`).run(uid, 'assistant', msg);
    db.prepare(`INSERT OR REPLACE INTO proactive_asks (user_id, kind, created_at) VALUES (?, 'fotos', datetime('now'))`).run(uid);
    res.json({ ok: true, asked: true });
  } catch (e) {
    console.error('[proactive-shot-ask]', e.message);
    res.json({ ok: true, asked: false });
  }
});
// La IA avisa por chat cuando hay comentarios sin responder (1 vez cada 24 h).
app.post('/api/proactive-comments-ask', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const recent = db.prepare(`SELECT 1 FROM proactive_asks WHERE user_id = ? AND kind = 'comentarios' AND created_at >= datetime('now', '-1 day')`).get(uid);
    if (recent) return res.json({ ok: true, asked: false });
    try {
      const { syncComments } = require('./insights');
      const st = getSettings(uid) || {};
      await syncComments(db, uid, suggestReply, st.openai_key || process.env.OPENAI_API_KEY || '');
    } catch (e) {}
    let n = 0;
    try { n = db.prepare(`SELECT COUNT(*) AS n FROM comment_queue WHERE user_id = ? AND status = 'pending'`).get(uid).n || 0; }
    catch (e) {}
    if (!n) return res.json({ ok: true, asked: false });
    const msg = `💬 Tenés ${n} ${n === 1 ? 'comentario nuevo' : 'comentarios nuevos'} en Instagram. Escribime "comentarios" y los respondemos juntos 👇`;
    db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)`).run(uid, 'assistant', msg);
    db.prepare(`INSERT OR REPLACE INTO proactive_asks (user_id, kind, created_at) VALUES (?, 'comentarios', datetime('now'))`).run(uid);
    res.json({ ok: true, asked: true });
  } catch (e) {
    console.error('[proactive-comments-ask]', e.message);
    res.json({ ok: true, asked: false });
  }
});

/* ---------- Reciclaje inteligente: republicar lo que voló ---------- */
app.get('/api/recycle-suggest', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const row = db.prepare(`
      SELECT p.id, p.caption, p.image_path, m.reach, p.published_at
      FROM post_metrics m JOIN posts p ON p.id = m.post_id
      WHERE p.user_id = ? AND p.status = 'published' AND m.reach > 0
        AND p.published_at < datetime('now', '-60 days')
        AND p.id NOT IN (SELECT post_id FROM recycled_posts)
      ORDER BY m.reach DESC LIMIT 1
    `).get(uid);
    if (!row) return res.json({ ok: true, suggestion: null });
    const daysAgo = Math.max(60, Math.round((Date.now() - new Date(row.published_at).getTime()) / 86400000));
    res.json({
      ok: true,
      suggestion: {
        post_id: row.id,
        caption: String(row.caption || '').slice(0, 120),
        reach: Math.round(row.reach),
        days_ago: daysAgo,
        thumb: row.image_path || null,
      },
    });
  } catch (e) {
    console.error('[recycle-suggest]', e.message);
    res.json({ ok: true, suggestion: null });
  }
});
app.post('/api/recycle', requireAuth, requireTrialValid, async (req, res) => {
  try {
    const uid = req.session.userId;
    const postId = parseInt((req.body || {}).post_id, 10);
    if (!postId) return res.status(400).json({ error: 'Post inválido' });
    const old = db.prepare(`SELECT * FROM posts WHERE id = ? AND user_id = ? AND status = 'published'`).get(postId, uid);
    if (!old) return res.status(404).json({ error: 'Post no encontrado' });
    if (db.prepare('SELECT post_id FROM recycled_posts WHERE post_id = ?').get(postId))
      return res.status(400).json({ error: 'Ya lo republicamos' });
    const profile = getProfile(uid);
    const apiKey = getSettings(uid).openai_key || process.env.OPENAI_API_KEY || '';
    let caption = '', hashtags = '';
    if (apiKey) {
      try {
        const out = await generateContent({
          business: profile.business_name, category: profile.category, tone: profile.tone,
          description: profile.description, dna: readDna(uid),
          topic: `Reescribí este posteo que funcionó muy bien, con texto fresco y otro ángulo. NO lo copies: hacelo nuevo sobre la misma idea. Idea original: "${String(old.caption || '').slice(0, 300)}"`,
          competitors: profile.competitors, goal: profile.goal,
          taste: tasteProfile(uid),
          tipo: TIPOS_VALIDOS.includes(old.tipo) ? old.tipo : '',
          performance: performanceBrief(db, uid),
        }, apiKey);
        caption = (out && out.caption) || ''; hashtags = (out && out.hashtags) || '';
      } catch (e) { console.error('[recycle] generate:', e.message); }
    }
    if (!String(caption).trim()) caption = String(old.caption || '').slice(0, 500);
    const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, tipo) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uid, '', caption, hashtags, 'draft', 'image', 'reciclado', TIPOS_VALIDOS.includes(old.tipo) ? old.tipo : '');
    const newId = r.lastInsertRowid;
    db.prepare('INSERT INTO recycled_posts (post_id, new_post_id, created_at) VALUES (?,?,?)').run(postId, newId, Date.now());
    try { recordSignal(uid, { id: newId, caption, hashtags, scheduled_at: '' }, 'recycled'); } catch (e) {}
    res.json({ ok: true, draft_id: newId });
  } catch (e) {
    console.error('[recycle]', e.message);
    res.status(500).json({ error: 'No se pudo republicar' });
  }
});

/* ---------- Serie fija semanal ---------- */
app.get('/api/series', requireAuth, (req, res) => {
  try {
    const dna = readDna(req.session.userId);
    const s = (dna && typeof dna.series === 'object' && dna.series) || null;
    res.json({ ok: true, series: (s && s.nombre)
      ? { nombre: String(s.nombre).slice(0, 60), weekday: Math.min(6, Math.max(0, parseInt(s.weekday, 10) || 0)), tipo: TIPOS_VALIDOS.includes(s.tipo) ? s.tipo : 'tip' }
      : null });
  } catch (e) { res.json({ ok: true, series: null }); }
});
app.post('/api/series', requireAuth, (req, res) => {
  try {
    const { nombre, weekday, tipo } = req.body || {};
    const wd = parseInt(weekday, 10);
    if (!nombre || typeof nombre !== 'string' || !nombre.trim() || !(wd >= 0 && wd <= 6) || !TIPOS_VALIDOS.includes(tipo))
      return res.status(400).json({ error: 'Datos inválidos' });
    const dna = readDna(req.session.userId);
    dna.series = { nombre: nombre.trim().slice(0, 60), weekday: wd, tipo };
    writeDna(req.session.userId, dna);
    res.json({ ok: true });
  } catch (e) {
    console.error('[series]', e.message);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

/* ---------- Pausar un tipo de contenido ---------- */
app.post('/api/pause-tipo', requireAuth, (req, res) => {
  try {
    const { tipo, paused } = req.body || {};
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    setPausedTipo(req.session.userId, tipo, !!paused);
    res.json({ ok: true });
  } catch (e) {
    console.error('[pause-tipo]', e.message);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

// Pilares del mes: 3-4 focos de contenido, con cache mensual.
async function buildPillars(uid) {
  const profile = getProfile(uid) || {};
  const settings = getSettings(uid) || {};
  const key = settings.openai_key || process.env.OPENAI_API_KEY || '';
  return generatePillars({
    business: profile.business_name,
    category: profile.category,
    description: profile.description,
    performance: performanceBrief(db, uid),
  }, key);
}
app.get('/api/pillars', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const mk = new Date().toISOString().slice(0, 7);
    const cached = db.prepare('SELECT month_key, pillars_json FROM pillars_cache WHERE user_id = ?').get(uid);
    if (cached && cached.month_key === mk && cached.pillars_json) {
      return res.json({ ok: true, pillars: JSON.parse(cached.pillars_json), cached: true });
    }
    const pillars = await buildPillars(uid);
    db.prepare('INSERT INTO pillars_cache (user_id, month_key, pillars_json) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET month_key=excluded.month_key, pillars_json=excluded.pillars_json').run(uid, mk, JSON.stringify(pillars));
    res.json({ ok: true, pillars, cached: false });
  } catch (e) {
    console.error('[pillars]', e.message);
    res.status(500).json({ error: 'No se pudieron generar los pilares' });
  }
});
app.post('/api/pillars/refresh', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const mk = new Date().toISOString().slice(0, 7);
    const pillars = await buildPillars(uid);
    db.prepare('INSERT INTO pillars_cache (user_id, month_key, pillars_json) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET month_key=excluded.month_key, pillars_json=excluded.pillars_json').run(uid, mk, JSON.stringify(pillars));
    res.json({ ok: true, pillars });
  } catch (e) {
    console.error('[pillars/refresh]', e.message);
    res.status(500).json({ error: 'No se pudieron regenerar los pilares' });
  }
});

// Misión de fotos de la semana: 3 fotos concretas + cuántas ya subió.
// Si no existe la de esta semana, se genera (IA con el contexto del negocio) y se cachea.
app.get('/api/photo-mission', requireAuth, async (req, res) => {
  try {
    const { getOrCreateMission } = require('./photo-mission');
    res.json({ ok: true, ...(await getOrCreateMission(db, req.session.userId)) });
  } catch (e) {
    console.error('[misión]', e.message);
    res.json({ ok: true, week_key: '', shots: [], uploaded: 0 });
  }
});

// Product shot con IA: si el cliente no subió fotos ESTA semana pero tiene de
// antes, la IA genera una variación nueva BASADA en sus fotos reales (referencia).
// Así el sistema "aprende" cómo se ve su producto y no repite las mismas fotos.
app.post('/api/product-shot', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const { refs = [], idea = '', angle = '' } = req.body || {};
    const profile = getProfile(req.session.userId);
    const settings = getSettings(req.session.userId);
    const apiKey = settings.openai_key || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ error: 'Sin clave de OpenAI' });
    const absRefs = refs.slice(0, 2)
      .map(fp => path.join(MEDIA_DIR, path.basename(String(fp || ''))))
      .filter(p => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; } });
    if (!absRefs.length) return res.status(400).json({ error: 'Sin fotos de referencia' });
    const prompt =
      `Foto promocional fotorrealista para el Instagram de "${profile.business_name || 'un negocio'}"` +
      `${profile.category ? ` (${profile.category})` : ''}. ` +
      `INSPIRADA EN las fotos de referencia: el MISMO producto, los MISMOS colores, la MISMA estética y estilo fotográfico. ` +
      `Tiene que parecer sacada en el mismo lugar, otro momento. ` +
      `Tema del posteo: ${idea || 'novedad'}. ${angle || ''} ` +
      `Sin texto, sin letras, sin logos, sin marcas de agua. Calidad de fotografía comercial profesional.`;
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt);
    for (const p of absRefs) {
      const buf = fs.readFileSync(p);
      const ext = path.extname(p).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      form.append('image', new Blob([buf], { type: mime }), 'ref' + ext);
    }
    form.append('size', '1024x1024');
    const r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`OpenAI ${r.status}: ${t.slice(0, 200)}`);
    }
    const data = await r.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) throw new Error('OpenAI no devolvió imagen');
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`;
    fs.writeFileSync(path.join(MEDIA_DIR, name), Buffer.from(b64, 'base64'));
    console.log(`[product-shot] generado para usuario ${req.session.userId} (${absRefs.length} refs)`);
    res.json({ ok: true, path: `/media/${name}` });
  } catch (e) {
    console.error('[product-shot]', e.message);
    res.status(500).json({ error: 'No se pudo generar la imagen' });
  }
});

// Capacidad real: 15 lugares por mes menos suscripciones activas
const MONTHLY_SPOTS = 50;
function spotsLeft() {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE plan_status = 'active' AND (plan IS NULL OR plan != 'free')`).get();
    return Math.max(0, MONTHLY_SPOTS - (row ? row.n : 0));
  } catch (_) { return MONTHLY_SPOTS; }
}
app.get('/api/capacity', (req, res) => {
  res.json({ ok: true, spots_left: spotsLeft(), spots_total: MONTHLY_SPOTS });
});

// ---------- Demo pública self-service (sin login) ----------
// El visitante genera 3 posteos de muestra sin registro ni WhatsApp.
app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo.html'));
});

app.post('/api/demo/generate', express.raw({ type: 'multipart/form-data', limit: '6mb' }), async (req, res) => {
  let fields, file;
  try {
    ({ fields, file } = demo.parseMultipart(req, req.body));
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Formulario inválido' });
  }
  const business = String(fields.business || '').trim().slice(0, 60);
  const category = String(fields.category || '').trim();
  const country = String(fields.country || '').trim().toUpperCase();
  const tone = String(fields.tone || 'vos').trim().toLowerCase();
  const goal = String(fields.goal || '').replace(/<[^>]*>/g, '').trim().slice(0, 400);
  const accent = String(fields.accent || '').trim().slice(0, 7);
  const btn = String(fields.btn || '').trim().slice(0, 7);
  if (!business) return res.status(400).json({ error: 'Contanos el nombre de tu negocio' });
  if (!demo.CATEGORIES.includes(category)) return res.status(400).json({ error: 'Rubro inválido' });
  if (!demo.COUNTRIES.includes(country)) return res.status(400).json({ error: 'País inválido' });
  if (!['vos', 'tu'].includes(tone)) return res.status(400).json({ error: 'Tono inválido' });

  const ip = demo.clientIp(req);
  const rl = demo.checkRateLimit(ip);
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Llegaste al límite de 5 demos por día. Volvé mañana 🚀' });
  }

  let photoPath = null;
  try {
    if (file) {
      const kind = demo.validImageKind(file);
      if (!kind) return res.status(400).json({ error: 'La foto tiene que ser JPG, PNG o WebP' });
      photoPath = path.join(os.tmpdir(), `posta-demo-up-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${kind}`);
      fs.writeFileSync(photoPath, file.buffer);
    }
    const { posts } = await demo.generateDemo({ business, category, country, tone, photoPath, goal, accent, btn });
    res.json({ ok: true, posts, remaining: rl.remaining });
  } catch (e) {
    console.error('[posta] Error en demo pública:', e.message);
    res.status(500).json({ error: 'No pudimos generar tu demo ahora. Probá de nuevo en unos minutos.' });
  } finally {
    if (photoPath) {
      try { fs.unlinkSync(photoPath); } catch (_) {}
    }
  }
});

// ---------- Prueba completa: la app por dentro, una sola vez, sin registro ----------
// El visitante pasa por onboarding mini → ve sus 6 ideas → su semana Pro armada
// (5 posteos: 4 imágenes + 1 video) → cartel de compra en el pico de emoción.
app.get('/prueba', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prueba.html'));
});

app.get('/api/trial/status', (req, res) => {
  res.json({ ok: true, used: false });
});

// Llave de prueba del dueño: con ?test_key=... se saltea el límite de 1 prueba
// por IP y no se registra el uso. La llave vive en Railway (variable
// TRIAL_TEST_KEY), nunca en el código ni en el repo.
function trialTestMode(req) {
  const k = process.env.TRIAL_TEST_KEY || '';
  return !!(k && req.query && req.query.test_key === k);
}

function buildTrialWeek(n) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() + (i + 1) * 86400000);
    return { day: days[d.getDay()], date: `${d.getDate()} ${months[d.getMonth()]}`, post: i };
  });
}

const TRIAL_IMG_MIME = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

app.post('/api/trial/generate', express.raw({ type: 'multipart/form-data', limit: '6mb' }), async (req, res) => {
  let fields, file;
  try {
    ({ fields, file } = demo.parseMultipart(req, req.body));
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Formulario inválido' });
  }
  const business = String(fields.business || '').trim().slice(0, 60);
  const ig = String(fields.ig || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 40);
  const category = String(fields.category || '').trim();
  const country = String(fields.country || '').trim().toUpperCase();
  const tone = String(fields.tone || 'vos').trim().toLowerCase();
  const goal = String(fields.goal || '').replace(/<[^>]*>/g, '').trim().slice(0, 400);
  const competitors = String(fields.competitors || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  // Preguntas previas de /prueba (opcionales): objetivo + producto + diferencial.
  // Se suman a la descripción para que ideas y posteos salgan a medida.
  const goal_key = ['vender', 'seguidores', 'lanzamiento', 'fidelizar'].includes(String(fields.goal_key || '').trim())
    ? String(fields.goal_key).trim() : '';
  const producto = String(fields.producto || '').replace(/<[^>]*>/g, '').trim().slice(0, 120);
  const diferencial = String(fields.diferencial || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  const richGoal = [goal, producto && ('Producto principal: ' + producto), diferencial && ('Diferencial: ' + diferencial)].filter(Boolean).join('\n');
  // Colores: si el visitante mandó (ya no se pide en el form), se usan; si no,
  // intentamos los colores REALES de su perfil de Instagram (best-effort) y
  // si no se puede, cae a la paleta curada de su rubro.
  const pal = demo.CATEGORY_COLORS[category] || demo.CATEGORY_COLORS.otro;
  const hexOk = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
  let accent = hexOk(fields.accent) ? String(fields.accent).trim().toUpperCase() : pal[0];
  let btn = hexOk(fields.btn) ? String(fields.btn).trim().toUpperCase() : pal[1];
  let colorSource = 'rubro';
  let igPic = null, igName = '';
  if (ig) {
    // Perfil real de Instagram (best-effort): foto + nombre + colores.
    // Si no se puede, todo cae a los fallbacks sin que se note.
    try {
      const prof = await demo.fetchIgProfile(ig);
      if (prof) {
        igPic = prof.pic; igName = prof.name;
        if (!hexOk(fields.accent) && prof.colors && prof.colors[0]) {
          accent = prof.colors[0];
          if (prof.colors[1]) btn = prof.colors[1];
          colorSource = 'instagram';
        }
      }
    } catch (e) { /* fallback silencioso */ }
  }
  if (!business) return res.status(400).json({ error: 'Contanos el nombre de tu negocio' });
  if (!demo.CATEGORIES.includes(category)) return res.status(400).json({ error: 'Rubro inválido' });
  if (!demo.COUNTRIES.includes(country)) return res.status(400).json({ error: 'País inválido' });
  if (!['vos', 'tu'].includes(tone)) return res.status(400).json({ error: 'Tono inválido' });

  const ip = demo.clientIp(req);
  const testMode = trialTestMode(req);
  const igKey = ig.toLowerCase();
  // Cache por @: si este Instagram ya generó su semana hace menos de 72h,
  // se la mostramos al instante sin regenerar (no gasta IA ni espera).
  if (!testMode && igKey) {
    try {
      const hit = db.prepare('SELECT payload, created_at FROM trial_cache WHERE ig = ?').get(igKey);
      if (hit && Date.now() - hit.created_at < 72 * 3600 * 1000) {
        const out = JSON.parse(hit.payload);
        out.cached = true;
        out.spots_left = spotsLeft();
        out.week = buildTrialWeek((out.posts || []).length);
        track(null, 'prueba_done', igKey + '|cached');
        return res.json(out);
      }
      if (hit) db.prepare('DELETE FROM trial_cache WHERE ig = ?').run(igKey);
      if (Math.random() < 0.05) db.exec(`DELETE FROM trial_cache WHERE created_at < ${Date.now() - 72 * 3600 * 1000}`);
    } catch (e) { /* si falla el cache, se genera igual */ }
  }
  // Anti-spam: 5 pruebas por día por IP (antes: 1 prueba por IP para siempre)
  if (!testMode) {
    const rl = demo.checkRateLimit(ip);
    if (!rl.allowed) {
      return res.status(429).json({ error: 'Llegaste al límite de 5 pruebas por día. Volvé mañana 🚀' });
    }
  }

  let photoPath = null;
  try {
    if (file) {
      const kind = demo.validImageKind(file);
      if (!kind) return res.status(400).json({ error: 'La imagen tiene que ser JPG, PNG o WebP' });
      photoPath = path.join(os.tmpdir(), `posta-trial-up-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${kind}`);
      fs.writeFileSync(photoPath, file.buffer);
    }
    // 6 ideas pensadas para SU negocio + semana Pro: 5 posteos (4 imágenes + 1 video)
    const ideas = await generateIdeas({ business, category, tone, description: richGoal, competitors }, null);
    const { posts, spec } = await demo.generateDemo({ business, category, country, tone, photoPath, goal: richGoal, goal_key, accent, btn, count: 5 });
    const videoOk = posts.some((p) => p && p.type === 'video' && p.video);
    if (!videoOk) console.error('[posta] ⚠️ TRIAL sin video para', business, '— revisar render de video');

    let screenshot = null;
    if (photoPath) {
      const ext = photoPath.split('.').pop().toLowerCase();
      screenshot = `data:${TRIAL_IMG_MIME[ext] || 'image/jpeg'};base64,` + fs.readFileSync(photoPath).toString('base64');
    }
    const out = {
      ok: true,
      business, ig, category,
      accent, btn, color_source: colorSource,
      ig_pic: igPic, ig_name: igName,
      ideas: ideas.slice(0, 6),
      posts,
      design: spec, // spec de diseño guardado: permite recolor/cambio de fotos sin regenerar textos
      week: buildTrialWeek(posts.length),
      screenshot,
      spots_left: spotsLeft(),
      video_ok: videoOk,
    };
    // Guardamos la semana por @ (72h): si vuelve, la ve al instante.
    if (!testMode && igKey) {
      try {
        const payload = JSON.stringify(out);
        if (payload.length < 12 * 1024 * 1024) {
          db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(igKey, payload, Date.now());
        }
      } catch (e) { console.error('[posta] no se pudo cachear la prueba:', e.message); }
    }
    track(null, 'prueba_done', igKey);
    res.json(out);
  } catch (e) {
    console.error('[posta] Error en prueba completa:', e.message);
    res.status(500).json({ error: 'No pudimos armar tu prueba ahora. Probá de nuevo en unos minutos.' });
  } finally {
    if (photoPath) {
      try { fs.unlinkSync(photoPath); } catch (_) {}
    }
  }
});

// ---------- Chat de la prueba: mejorar los posteos por chat ----------
// El visitante pide cambios ("hacelo más canchero") y la IA edita los TEXTOS
// (caption/hashtags) de sus posteos ya creados. Los cambios se guardan en el
// trial_cache, así viajan a su cuenta como borradores cuando se registra.
// Sin login: rate limit de 8 mensajes por día por IP.
const TRIAL_CHAT_LIMIT = 8;
try { db.exec('CREATE TABLE IF NOT EXISTS trial_chat_usage (ip TEXT, day TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (ip, day))'); } catch (e) {}
function trialChatAllowed(ip) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM trial_chat_usage WHERE day < date('now', '-7 days')`);
    const row = db.prepare('SELECT count FROM trial_chat_usage WHERE ip = ? AND day = ?').get(ip, day);
    if (row && row.count >= TRIAL_CHAT_LIMIT) return { ok: false, remaining: 0 };
    db.prepare('INSERT INTO trial_chat_usage (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1').run(ip, day);
    const now = db.prepare('SELECT count FROM trial_chat_usage WHERE ip = ? AND day = ?').get(ip, day);
    return { ok: true, remaining: Math.max(0, TRIAL_CHAT_LIMIT - (now ? now.count : 1)) };
  } catch (e) { return { ok: true, remaining: TRIAL_CHAT_LIMIT }; }
}
app.post('/api/trial/chat', express.json({ limit: '64kb' }), async (req, res) => {
  const ip = demo.clientIp(req);
  const { ig, message, history } = req.body || {};
  const msg = String(message || '').trim().slice(0, 300);
  const igKey = String(ig || '').trim().replace(/^@/, '').toLowerCase();
  if (!msg) return res.status(400).json({ error: 'Escribí qué querés cambiar 🙂' });
  if (!igKey || !/^[a-z0-9._]{1,30}$/.test(igKey)) return res.status(400).json({ error: 'Falta tu Instagram' });
  const chatChk = trialChatAllowed(ip);
  if (!chatChk.ok) return res.status(429).json({ error: 'chat_limit' });
  const hit = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(igKey);
  if (!hit) return res.status(404).json({ error: 'No encontramos tu semana. Generala de nuevo 🙂' });
  let out;
  try { out = JSON.parse(hit.payload); } catch (e) { return res.status(500).json({ error: 'No pudimos leer tu semana' }); }
  const posts = out.posts || [];
  if (!posts.length) return res.status(404).json({ error: 'No encontramos tus posteos' });
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return res.status(500).json({ error: 'El chat no está disponible ahora. Probá en unos minutos.' });
  const week = out.week || [];
  const postList = posts.map((p, i) => {
    const w = week.find((x) => x.post === i);
    return { i, dia: w ? w.day : ('posteo ' + (i + 1)), caption: String(p.caption || ''), hashtags: String(p.hashtags || '') };
  });
  const hist = Array.isArray(history) ? history.slice(-6).map((h) => `${h.role === 'user' ? 'Dueño' : 'Posta'}: ${String(h.text || '').slice(0, 200)}`).join('\n') : '';
  const sys =
    'Sos el editor de contenidos de Posta, un servicio argentino que arma los posteos de Instagram de los negocios. ' +
    'Hablás con el dueño de "' + String(out.business || 'su negocio').slice(0, 60) + '" (rubro: ' + String(out.category || 'general').slice(0, 30) + ') que está probando gratis y YA tiene sus 5 posteos creados. ' +
    'Te pide cambios. Podés editar ÚNICAMENTE los textos: caption y hashtags de uno o varios posteos. ' +
    'NO podés cambiar diseños, fotos ni titulares (vienen en la imagen). Si te pide cambiar la FOTO de un posteo, guialo: "tocá el posteo y después el botón 📷 Cambiar foto". ' +
    'Si te pide cambiar los COLORES, guialo: "tocá el botón 🎨 Colores que está acá abajo". ' +
    'Si te pide cambiar el TITULAR del diseño, explicale en una línea que el titular es parte del diseño y ofrecé mejorar el caption en su lugar. ' +
    'Escribís en español rioplatense con voseo, tono cercano y canchero, 1-2 líneas.\n\n' +
    'Posteos (índice, día, caption actual, hashtags actuales):\n' +
    postList.map((p) => `#${p.i} (${p.dia}): "${p.caption.slice(0, 220)}" [${p.hashtags.slice(0, 120)}]`).join('\n') +
    (hist ? '\n\nHistorial reciente:\n' + hist : '') +
    '\n\nPedido del dueño: "' + msg.replace(/"/g, "'") + '"\n\n' +
    'Respondé SOLO con un JSON: {"edits": [{"post": <índice>, "caption": "...", "hashtags": "..."}], "reply": "<respuesta corta que ve el usuario>"}. ' +
    'Si el pedido aplica a varios posteos, incluí todos los que correspondan. Si no se entiende, edits: [] y pedí aclaración en reply.';
  try {
    const ai = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }],
        max_tokens: 900,
        temperature: 0.8,
      }),
    });
    if (!ai.ok) throw new Error('OpenAI ' + ai.status);
    const data = await ai.json();
    let parsed;
    try { parsed = JSON.parse(data.choices[0].message.content); } catch (e) { throw new Error('respuesta IA inválida'); }
    const edits = (parsed.edits || [])
      .filter((e) => e && Number.isInteger(e.post) && e.post >= 0 && e.post < posts.length)
      .slice(0, 5);
    for (const e of edits) {
      if (typeof e.caption === 'string' && e.caption.trim()) posts[e.post].caption = e.caption.trim().slice(0, 600);
      if (typeof e.hashtags === 'string' && e.hashtags.trim()) posts[e.post].hashtags = e.hashtags.trim().slice(0, 300);
    }
    if (edits.length) {
      try { db.prepare('UPDATE trial_cache SET payload = ? WHERE ig = ?').run(JSON.stringify(out), igKey); } catch (e) {}
    }
    res.json({
      reply: String(parsed.reply || 'Listo ✅ ¿Algo más?').slice(0, 300),
      edits: edits.map((e) => ({ post: e.post, caption: posts[e.post].caption, hashtags: posts[e.post].hashtags })),
      chat_remaining: chatChk.remaining,
    });
  } catch (e) {
    console.error('[posta] trial chat:', e.message);
    res.status(500).json({ error: 'No pude procesar tu pedido. Probá de nuevo 🙂' });
  }
});

// ---------- Rediseño de la prueba: colores y fotos ----------
// Re-renderiza los posteos con los colores EXACTOS de la marca del cliente
// y/o nuevas fotos (subidas por él o elegidas de nuestras opciones).
// No toca textos: el diseño y los posteos se mantienen, solo cambia lo pedido.
const TRIAL_REDESIGN_LIMIT = 5; // rediseños por día por IP (render es costoso)
try { db.exec('CREATE TABLE IF NOT EXISTS trial_redesign_usage (ip TEXT, day TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (ip, day))'); } catch (e) {}
function trialRedesignAllowed(ip) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM trial_redesign_usage WHERE day < date('now', '-7 days')`);
    const row = db.prepare('SELECT count FROM trial_redesign_usage WHERE ip = ? AND day = ?').get(ip, day);
    if (row && row.count >= TRIAL_REDESIGN_LIMIT) return false;
    db.prepare('INSERT INTO trial_redesign_usage (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1').run(ip, day);
    return true;
  } catch (e) { return true; }
}
const cleanHex6 = (v) => {
  const h = String(v || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(h) ? '#' + h.toUpperCase() : null;
};
app.post('/api/trial/redesign', express.json({ limit: '12mb' }), async (req, res) => {
  const ip = demo.clientIp(req);
  const { ig, colors, photos } = req.body || {};
  const igKey = String(ig || '').trim().replace(/^@/, '').toLowerCase();
  if (!igKey || !/^[a-z0-9._]{1,30}$/.test(igKey)) return res.status(400).json({ error: 'Falta tu Instagram' });
  let newColors = null;
  if (colors) {
    const accent = cleanHex6(colors.accent), btn = cleanHex6(colors.btn);
    if (!accent || !btn) return res.status(400).json({ error: 'Colores inválidos' });
    newColors = { accent, btn };
  }
  const photoOverrides = [];
  if (Array.isArray(photos)) {
    for (const o of photos.slice(0, 5)) {
      const index = parseInt(o && o.index, 10);
      const ph = String((o && o.photo) || '');
      if (!Number.isInteger(index) || index < 0 || index >= 5 || !ph) continue;
      const dm = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(ph);
      if (dm) {
        if (ph.length > 8 * 1024 * 1024) continue;
        photoOverrides.push({ index, photo: ph });
        continue;
      }
      const sm = /^\/demo-stock\/([a-z0-9_-]+)\.webp$/i.exec(ph);
      if (sm) {
        const fp = path.join(__dirname, 'public', 'demo-stock', sm[1] + '.webp');
        if (fs.existsSync(fp)) photoOverrides.push({ index, photo: fp });
      }
    }
  }
  if (!newColors && !photoOverrides.length) return res.status(400).json({ error: 'Nada para cambiar' });
  if (!trialRedesignAllowed(ip)) return res.status(429).json({ error: 'redesign_limit' });
  const hit = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(igKey);
  if (!hit) return res.status(404).json({ error: 'No encontramos tu semana. Generala de nuevo 🙂' });
  let out;
  try { out = JSON.parse(hit.payload); } catch (e) { return res.status(500).json({ error: 'No pudimos leer tu semana' }); }
  if (!out.design || !Array.isArray(out.design.posts) || !out.design.posts.length) {
    return res.status(400).json({ error: 'Tu semana es de una versión anterior: generala de nuevo para usar colores y fotos 🙂' });
  }
  try {
    const t0 = Date.now();
    const r = await demo.redesignDemo({
      spec: out.design,
      colors: newColors || { accent: out.accent, btn: out.btn },
      photoOverrides: photoOverrides.length ? photoOverrides : null,
      userPhotoDataUrl: out.screenshot || null,
    });
    r.idxs.forEach((postIdx, k) => {
      const p = out.posts[postIdx];
      if (!p) return;
      if (postIdx === r.videoIdx && r.video) {
        p.type = 'video';
        p.video = r.video;
        delete p.image;
      } else {
        p.type = 'image';
        p.image = r.images[k];
        delete p.video;
      }
    });
    // Persistir la selección de fotos en el spec: un recolor posterior no debe
    // restaurar la foto anterior. dataURL = subida del usuario (va en el cache),
    // ruta absoluta = foto de stock (estable).
    for (const o of photoOverrides) {
      const sp = out.design.posts[o.index];
      if (!sp) continue;
      if (typeof o.photo === 'string' && o.photo.startsWith('data:image/')) {
        sp.photo = o.photo;
      } else if (typeof o.photo === 'string' && o.photo.startsWith('/')) {
        sp.photo = o.photo;
      }
    }
    if (newColors) { out.accent = newColors.accent; out.btn = newColors.btn; }
    try { db.prepare('UPDATE trial_cache SET payload = ? WHERE ig = ?').run(JSON.stringify(out), igKey); } catch (e) {}
    const video_ok = out.posts.some((p) => p && p.type === 'video' && p.video);
    res.json({ ok: true, posts: out.posts, design: out.design, accent: out.accent, btn: out.btn, video_ok, gen_ms: Date.now() - t0 });
  } catch (e) {
    console.error('[posta] trial redesign:', e.message);
    res.status(500).json({ error: 'No pudimos aplicar el cambio. Probá de nuevo 🙂' });
  }
});

// Opciones de fotos nuestras para un posteo (del pool del rubro, sin las ya usadas)
app.get('/api/trial/photo-options', (req, res) => {
  const igKey = String(req.query.ig || '').trim().replace(/^@/, '').toLowerCase();
  if (!igKey || !/^[a-z0-9._]{1,30}$/.test(igKey)) return res.status(400).json({ error: 'Falta tu Instagram' });
  const hit = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(igKey);
  if (!hit) return res.status(404).json({ error: 'No encontramos tu semana' });
  let out;
  try { out = JSON.parse(hit.payload); } catch (e) { return res.status(500).json({ error: 'Error' }); }
  const used = ((out.design && out.design.photos) || [])
    .filter((p) => typeof p === 'string')
    .map((p) => p.split('/').pop().replace(/\.webp$/i, ''));
  res.json({ ok: true, options: demo.trialPhotoOptions(out.category, out.business, used, 8) });
});

// Colores exactos desde el logo del cliente: sube la foto de su logo y
// extraemos los 2 colores dominantes para usarlos idénticos en los posteos.
const LOGO_COLORS_LIMIT = 20; // por día por IP (operación liviana)
try { db.exec('CREATE TABLE IF NOT EXISTS trial_logo_usage (ip TEXT, day TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (ip, day))'); } catch (e) {}
function trialLogoAllowed(ip) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const row = db.prepare('SELECT count FROM trial_logo_usage WHERE ip = ? AND day = ?').get(ip, day);
    if (row && row.count >= LOGO_COLORS_LIMIT) return false;
    db.prepare('INSERT INTO trial_logo_usage (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1').run(ip, day);
    return true;
  } catch (e) { return true; }
}
app.post('/api/trial/logo-colors', express.json({ limit: '6mb' }), async (req, res) => {
  const ip = demo.clientIp(req);
  if (!trialLogoAllowed(ip)) return res.status(429).json({ error: 'Demasiados intentos por hoy' });
  const img = String((req.body && req.body.image) || '');
  const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(img);
  if (!m) return res.status(400).json({ error: 'Subí una foto de tu logo (JPG, PNG o WebP)' });
  if (img.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'La foto es muy pesada' });
  try {
    const colors = await demo.extractColorsFromBuffer(Buffer.from(m[3], 'base64'));
    res.json({ ok: true, colors });
  } catch (e) {
    res.status(400).json({ error: e.message || 'No pudimos leer los colores de tu logo' });
  }
});

// ---------- Health ----------
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'posta', demoDefault: true }));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`[posta] Corriendo en http://localhost:${PORT} (${NODE_ENV})`);
  console.log(`[posta] Mercado Pago: ${mp.mpConfigured() ? 'configurado ✅' : 'no configurado (pagos desactivados)'}`);
  startScheduler(db);
  startTokenRefresh();
});
