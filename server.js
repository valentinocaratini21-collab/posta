// Posta — servidor principal
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const { generateContent, generateIdeas } = require('./generator');
const creator = require('./creator.js');
const { getAuthUrl, exchangeCodeForTokens, getIgUsername } = require('./instagram');
const { startScheduler } = require('./scheduler');
const { reconcileUser } = require('./billing-sync');
const { startTokenRefresh } = require('./tokenrefresh');
const { renderVideo, ffmpegAvailable } = require('./video');
const { PLANS, TRIAL_PLAN, getPlan, getPlans, formatPrice, PLAN_ANCHOR } = require('./config/plans');
const TRIAL_DAYS = 10;
const mp = require('./mercadopago');
const demo = require('./demo');
const os = require('os');

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'media');
const IMAGE_BASE_URL = (process.env.IMAGE_BASE_URL || '').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const SESSION_SECRET = process.env.SESSION_SECRET;
if (IS_PROD && !SESSION_SECRET) {
  console.error('[posta] ❌ ERROR: en producción tenés que definir SESSION_SECRET en las variables de entorno.');
  process.exit(1);
}
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: SESSION_SECRET || 'posta-dev-secret-cambiar-en-prod',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 3600 * 1000, httpOnly: true, secure: process.env.COOKIE_SECURE === '1' },
  })
);
app.use('/media', express.static(MEDIA_DIR));
app.use(express.static(path.join(__dirname, 'public')));

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
function maskSettings(s) {
  const c = { ...s };
  if (c.openai_key) c.openai_key = '••••••' + c.openai_key.slice(-4);
  if (c.pexels_key) c.pexels_key = '••••••' + c.pexels_key.slice(-4);
  if (c.ig_access_token) c.ig_access_token = '••••••' + c.ig_access_token.slice(-4);
  if (c.meta_app_secret) c.meta_app_secret = '••••••';
  return c;
}

// ---------- Auth ----------
app.post('/api/auth/register', (req, res) => {
  const { email, password, ref } = req.body || {};
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
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Ese email ya está registrado' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  req.session.userId = user.id;
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, created_at, plan, plan_status, mp_preapproval_id, mp_payer_email, trial_ends_at FROM users WHERE id = ?').get(req.session.userId);
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
app.get('/api/profile', requireAuth, (req, res) => res.json(getProfile(req.session.userId)));

app.put('/api/profile', requireAuth, (req, res) => {
  const { business_name, category, tone, description, ig_username, competitors, goal } = req.body || {};
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
    image_base_url || '',
    validTimezone(timezone) ? timezone : (cur.timezone || DEFAULT_TZ),
    Number.isInteger(preferred_palette) ? preferred_palette : (cur.preferred_palette ?? 0),
    bc,
    pexels_key && !pexels_key.startsWith('••••') ? pexels_key : (cur.pexels_key || ''),
    req.session.userId
  );
  res.json({ ok: true });
});

// ---------- Generador ----------
app.post('/api/generate', requireAuth, requireTrialValid, async (req, res) => {
  const { topic } = req.body || {};
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Contanos el tema del post' });
  const profile = getProfile(req.session.userId);
  const settings = getSettings(req.session.userId);
  try {
    const out = await generateContent(
      {
        business: profile.business_name,
        category: profile.category,
        tone: profile.tone,
        topic: topic.trim(),
        competitors: profile.competitors,
      },
      settings.openai_key || process.env.OPENAI_API_KEY || ''
    );
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo generar el contenido' });
  }
});

// ---------- Creador v2: 6 opciones con foto, colores y energía ----------
app.post('/api/creator/options', requireAuth, async (req, res) => {
  const { topic, feedback, productPhoto } = req.body || {};
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'Contanos la idea del post' });
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
    const ids = clean.map((c) =>
      stmt.run(req.session.userId, c.image, c.caption, c.hashtags, c.scheduled_at, 'scheduled', 'image').lastInsertRowid
    );
    res.json({ ok: true, count: ids.length, ids });
  } catch (e) {
    console.error('[creator/schedule]', e.message);
    res.status(500).json({ error: e.message || 'No se pudieron programar' });
  }
});

// ---------- Ideas: nosotros pensamos el contenido por el cliente ----------
app.post('/api/ideas', requireAuth, requireTrialValid, async (req, res) => {
  const profile = getProfile(req.session.userId);
  const settings = getSettings(req.session.userId);
  try {
    const ideas = await generateIdeas(
      {
        business: profile.business_name,
        category: profile.category,
        tone: profile.tone,
        description: profile.description,
        competitors: profile.competitors,
      },
      settings.openai_key || process.env.OPENAI_API_KEY || ''
    );
    res.json({ ideas });
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron generar las ideas' });
  }
});

// ---------- Subida de imagen (PNG del diseñador) ----------
app.post('/api/media', requireAuth, express.raw({ type: 'image/png', limit: '15mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Imagen vacía' });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
  res.json({ path: `/media/${name}` });
});

// ---------- Librería de medios del cliente (fotos + logo) ----------
app.get('/api/assets', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, file_path, kind, created_at FROM assets WHERE user_id = ? ORDER BY created_at ASC').all(req.session.userId);
  res.json(rows);
});

app.post('/api/assets', requireAuth, express.raw({ type: 'image/*', limit: '15mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Imagen vacía' });
  const kind = req.query.kind === 'logo' ? 'logo' : 'photo';
  if (kind === 'photo') {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND kind = 'photo'`).get(req.session.userId).c;
    if (n >= 20) return res.status(400).json({ error: 'Llegaste al máximo de 20 fotos' });
  }
  const ct = req.get('Content-Type') || '';
  const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
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

app.post('/api/posts', requireAuth, requireTrialValid, (req, res) => {
  const { image_path, caption, hashtags, scheduled_at, media_type } = req.body || {};
  if (!image_path) return res.status(400).json({ error: 'Falta la imagen' });
  const status = scheduled_at ? 'scheduled' : 'draft';
  const mt = media_type === 'video' ? 'video' : 'image';
  const r = db.prepare(
    'INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type) VALUES (?,?,?,?,?,?,?)'
  ).run(req.session.userId, image_path, caption || '', hashtags || '', scheduled_at || null, status, mt);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.patch('/api/posts/:id', requireAuth, (req, res) => {
  const { scheduled_at, caption, hashtags, action } = req.body || {};
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (action === 'cancel') {
    db.prepare(`UPDATE posts SET status='cancelled' WHERE id=?`).run(post.id);
    recordSignal(req.session.userId, post, 'rejected'); // lo canceló = no le gustó
  } else if (action === 'publish-now') {
    db.prepare(`UPDATE posts SET status='scheduled', scheduled_at=datetime('now'), error='' WHERE id=?`).run(post.id);
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
function postWeekKey(p, tz) {
  return mondayKeyOf(ymdInTz(p.scheduled_at || p.published_at || p.created_at, tz) || tzToday(tz));
}
// Guarda (o actualiza) la señal del cliente para un posteo. La última señal vale.
function recordSignal(userId, post, signal) {
  try {
    const tz = userTz(userId);
    const prof = getProfile(userId) || {};
    const wk = postWeekKey(post, tz);
    db.prepare(`
      INSERT INTO post_signals (user_id, post_id, hashtags, scheduled_for, rubro, client_signal, week_key, updated_at)
      VALUES (?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id, post_id) DO UPDATE SET
        client_signal=excluded.client_signal, hashtags=excluded.hashtags,
        scheduled_for=excluded.scheduled_for, rubro=excluded.rubro,
        week_key=excluded.week_key, updated_at=datetime('now')
    `).run(userId, post.id, post.hashtags || '', post.scheduled_at || '', prof.category || '', signal, wk);
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
    },
  });
});

// ---------- Instagram OAuth (Instagram Login / Business Login) ----------
app.get('/api/ig/start', requireAuth, (req, res) => {
  const s = getSettings(req.session.userId);
  const embedUrl = s.ig_embed_url || process.env.META_IG_EMBED_URL || process.env.IG_EMBED_URL;
  if (!embedUrl)
    return res.status(400).json({ error: 'Configurá tu Instagram Embed URL en Ajustes' });
  // redirect_uri para el intercambio del code: el de la Embed URL, o el de este host
  let redirectUri = '';
  try {
    redirectUri = new URL(embedUrl).searchParams.get('redirect_uri') || '';
  } catch (e) { /* url inválida, se usa el fallback */ }
  if (!redirectUri) {
    const host = req.get('host');
    redirectUri = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}/api/ig/callback`;
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.igState = state;
  req.session.igRedirect = redirectUri;
  res.json({ url: getAuthUrl(embedUrl, state) });
});

app.get('/api/ig/callback', async (req, res) => {
  const { code, state } = req.query;
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
    let username = '';
    try {
      username = await getIgUsername(igUserId, accessToken);
    } catch (e) { /* no bloquea la conexión */ }
    // Un Instagram = una sola prueba gratis en Posta (aunque lo desconecten después)
    const dupe = igUserId ? db.prepare(`SELECT user_id FROM settings WHERE ig_user_id = ? AND user_id != ?`).get(igUserId, req.session.userId) : null;
    if (dupe) {
      return res.redirect('/#/app/ajustes?ig=error&msg=' + encodeURIComponent('Esta cuenta de Instagram ya está vinculada a otra cuenta de Posta.'));
    }
    const usedBefore = igUserId ? db.prepare(`SELECT first_user_id FROM ig_registry WHERE ig_user_id = ?`).get(igUserId) : null;
    if (usedBefore && usedBefore.first_user_id !== req.session.userId) {
      return res.redirect('/#/app/ajustes?ig=error&msg=' + encodeURIComponent('Esta cuenta de Instagram ya fue usada en Posta. Cada cuenta de Instagram puede activar una sola prueba gratis.'));
    }
    db.prepare(
      `UPDATE settings SET ig_user_id=?, ig_page_id='', ig_access_token=?, ig_token_issued_at=datetime('now'), ig_token_warning=0, updated_at=datetime('now') WHERE user_id=?`
    ).run(igUserId, accessToken, req.session.userId);
    // Registro permanente del uso (sobrevive a desconexiones)
    try {
      db.prepare(`INSERT OR IGNORE INTO ig_registry (ig_user_id, first_user_id) VALUES (?, ?)`).run(igUserId, req.session.userId);
    } catch (e) { /* no bloquea la conexión */ }
    db.prepare(`UPDATE profiles SET ig_username=?, ig_connected=1 WHERE user_id=?`).run(username, req.session.userId);
    res.redirect('/#/app/ajustes?ig=ok');
  } catch (e) {
    res.redirect('/#/app/ajustes?ig=error&msg=' + encodeURIComponent(e.message));
  }
});

app.post('/api/ig/disconnect', requireAuth, (req, res) => {
  db.prepare(`UPDATE settings SET ig_user_id='', ig_page_id='', ig_access_token='' WHERE user_id=?`).run(req.session.userId);
  db.prepare(`UPDATE profiles SET ig_connected=0 WHERE user_id=?`).run(req.session.userId);
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
    const user = db.prepare('SELECT id, email, plan_status, mp_preapproval_id, referred_by FROM users WHERE id = ?').get(req.session.userId);
    if (user.plan_status === 'active' && user.mp_preapproval_id) {
      return res.status(400).json({ error: 'Ya tenés una suscripción activa. Si querés cambiar de plan, primero cancelá la actual desde Mi plan.' });
    }
    // Guardar el email de MP para pre-completarlo la próxima vez
    try { db.prepare(`UPDATE users SET mp_payer_email=? WHERE id=?`).run(payerEmail, user.id); } catch (e) {}
    const baseUrl = `${req.protocol}://${req.get('host')}`;
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
  const user = db.prepare('SELECT mp_preapproval_id FROM users WHERE id = ?').get(req.session.userId);
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
  const baseUrl = `${req.protocol}://${req.get('host')}`;
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

// Capacidad real: 15 lugares por mes menos suscripciones activas
const MONTHLY_SPOTS = 15;
function spotsLeft() {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE plan_status = 'active'`).get();
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
  const goal = String(fields.goal || '').replace(/<[^>]*>/g, '').trim().slice(0, 300);
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
    const posts = await demo.generateDemo({ business, category, country, tone, photoPath, goal, accent, btn });
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
  if (trialTestMode(req)) return res.json({ ok: true, used: false });
  const ip = demo.clientIp(req);
  const row = db.prepare('SELECT ip FROM trial_usage WHERE ip = ?').get(ip);
  res.json({ ok: true, used: !!row });
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
  const goal = String(fields.goal || '').replace(/<[^>]*>/g, '').trim().slice(0, 300);
  const competitors = String(fields.competitors || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  const accent = String(fields.accent || '').trim().slice(0, 7);
  const btn = String(fields.btn || '').trim().slice(0, 7);
  if (!business) return res.status(400).json({ error: 'Contanos el nombre de tu negocio' });
  if (!demo.CATEGORIES.includes(category)) return res.status(400).json({ error: 'Rubro inválido' });
  if (!demo.COUNTRIES.includes(country)) return res.status(400).json({ error: 'País inválido' });
  if (!['vos', 'tu'].includes(tone)) return res.status(400).json({ error: 'Tono inválido' });

  const ip = demo.clientIp(req);
  const testMode = trialTestMode(req);
  if (!testMode && db.prepare('SELECT ip FROM trial_usage WHERE ip = ?').get(ip)) {
    return res.status(429).json({ error: 'Ya usaste tu prueba gratis 🙏 Creá tu cuenta para seguir.' });
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
    const ideas = await generateIdeas({ business, category, tone, description: goal, competitors }, null);
    const posts = await demo.generateDemo({ business, category, country, tone, photoPath, goal, accent, btn, count: 5 });
    if (!testMode) db.prepare('INSERT OR IGNORE INTO trial_usage (ip) VALUES (?)').run(ip);
    const videoOk = posts.some((p) => p && p.type === 'video' && p.video);
    if (!videoOk) console.error('[posta] ⚠️ TRIAL sin video para', business, '— revisar render de video');

    let screenshot = null;
    if (photoPath) {
      const ext = photoPath.split('.').pop().toLowerCase();
      screenshot = `data:${TRIAL_IMG_MIME[ext] || 'image/jpeg'};base64,` + fs.readFileSync(photoPath).toString('base64');
    }
    res.json({
      ok: true,
      business, ig, category,
      ideas: ideas.slice(0, 6),
      posts,
      week: buildTrialWeek(posts.length),
      screenshot,
      spots_left: spotsLeft(),
      video_ok: videoOk,
    });
  } catch (e) {
    console.error('[posta] Error en prueba completa:', e.message);
    res.status(500).json({ error: 'No pudimos armar tu prueba ahora. Probá de nuevo en unos minutos.' });
  } finally {
    if (photoPath) {
      try { fs.unlinkSync(photoPath); } catch (_) {}
    }
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
