// Posta — servidor principal
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const costs = require('./costs');
const autopilot = require('./autopilot');
costs.initCosts(db, {
  // Techo mensual de IA por usuario (10% del plan, 2026-10-04): costs.js lo usa
  // en assertAiOk para que ningún usuario supere su techo, pase lo que pase.
  planFor: (uid) => planForUid(uid),
}); // medición de gasto de IA (api_costs) + techo mensual por usuario
const push = require('./push');
push.initPush(db); // push notifications (VAPID); inactivo en silencio sin las env vars
const dogfood = require('./dogfood');
dogfood.initDogfood(db); // Posty dogfood: columna kind + tabla dogfood_state
// Observabilidad dogfood (2026-10-05): los errores de imagen del dogfood van
// al ring buffer de logGenError (visible en /api/diag), además del console.
try { dogfood.setErrorReporter(logGenError); } catch (e) {}
// MIGRACION kind=design — diseños fantasma 2026-09-30
// Los diseños generados por "✨ Otro diseño" se subían por /api/media y quedaban
// registrados como kind='photo': al regenerar, assetPhotos() podía elegir el
// diseño anterior como fondo y su texto se transparentaba detrás del nuevo.
// Reclasifica a kind='design' todo asset 'photo' cuyo archivo sea la imagen de
// algún post (image_path LIKE '/media/%'). Idempotente: correrla N veces solo
// vuelve a poner 'design' donde ya lo es (0 filas afectadas la 2da vez).
try {
  const r = db.prepare(`UPDATE assets SET kind='design' WHERE kind='photo' AND file_path IN (SELECT image_path FROM posts WHERE image_path LIKE '/media/%')`).run();
  if (r.changes) console.log(`[migracion] kind=design: ${r.changes} diseños reclasificados`);
} catch (e) { console.error('[migracion] kind=design:', e.message); }
const { generateContent, generateCaptions, generateIdeas, chatIdea, suggestReply, performanceBrief, bestHoursLine, generatePillars, voiceExamples } = require('./generator');
const { upcomingEphemeris } = require('./ephemeris');
const creator = require('./creator.js');
const { getAuthUrl, exchangeCodeForTokens, getIgUsername, getIgProfile } = require('./instagram');
const { startScheduler, publishSinglePost } = require('./scheduler');
const approval = require('./approval'); // "Posty te avisa": firmas y avisos de aprobación
const { reconcileUser } = require('./billing-sync');
const { startTokenRefresh } = require('./tokenrefresh');
const { analyzeWebsite } = require('./website-study');
const meliApi = require('./meli'); // MercadoLibre: API pública sin key (Track 4)
const { analyzeFbPage, extractPageId } = require('./fb-page');
const { mineComments, buildDnaPatch } = require('./ig-comments');
const { analyzeGooglePlaces } = require('./google-places');
const { renderVideo, ffmpegAvailable } = require('./video');
const { postyLevel, LEVEL_UP_MSGS } = require('./posty-level'); // 🧠 Niveles de conocimiento de Posty
const { PLANS, TRIAL_PLAN, getPlan, getPlans, formatPrice, PLAN_ANCHOR } = require('./config/plans');
// Plan del usuario (para techo mensual de IA y límites diarios por plan).
// Un solo lugar: costs.js lo usa vía planFor para el techo 5%.
function planForUid(uid) {
  try {
    const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(uid);
    return getPlan(u && u.plan_status === 'active' ? u.plan : TRIAL_PLAN);
  } catch (e) { return getPlan(TRIAL_PLAN); }
}
const AI_LIMITS_DEFAULT = { chatPerDay: 40, weeksPerDay: 1, regensPerDay: 3 };
function aiLimitsFor(uid) {
  try {
    const p = planForUid(uid);
    return (p && p.ai) || AI_LIMITS_DEFAULT;
  } catch (e) { return AI_LIMITS_DEFAULT; }
}
// Style Lock visual: contrato de Worker 1 (style-visual.js). Si el módulo aún no
// existe, los fallbacks garantizan que nada se rompa: analyzeVisualStyle resuelve
// {ok:false}, getVisualStyle devuelve null y visualStyleBlock ''.
let analyzeVisualStyle = () => Promise.resolve({ ok: false, error: 'módulo no disponible' });
let getVisualStyle = () => null;
let visualStyleBlock = () => '';
try { ({ analyzeVisualStyle, getVisualStyle, visualStyleBlock } = require('./style-visual')); }
catch (e) { console.error('[init] style-visual no disponible:', e.message); }
// Caption Style Lock (caption-style.js): perfil de escritura del cliente desde su IG.
// Mismo patrón defensivo: sin módulo, todo resuelve vacío y nada se rompe.
let analyzeCaptionStyle = () => Promise.resolve({ ok: false, error: 'módulo no disponible' });
let getCaptionStyle = () => null;
let captionStyleBlock = () => '';
let captionPromptExtras = () => '';
let CAPTION_CHECKLIST = '';
try { ({ analyzeCaptionStyle, getCaptionStyle, captionStyleBlock, captionPromptExtras, CAPTION_CHECKLIST } = require('./caption-style')); }
catch (e) { console.error('[init] caption-style no disponible:', e.message); }
// Brief Unificado del Cliente (client-brief.js): UNA sola fuente de verdad —
// NEGOCIO + VOZ + VISUAL + MARCA en un bloque compacto. Mismo patrón defensivo.
let refreshClientBrief = () => Promise.resolve({ ok: false, error: 'módulo no disponible' });
let briefBlockFor = () => '';
try { ({ refreshClientBrief, briefBlockFor } = require('./client-brief')); }
catch (e) { console.error('[init] client-brief no disponible:', e.message); }
// Estilos de imagen curados (image-styles.js): "secret codes" para gpt-image-2
// (/food, /flatlay, /legoify...). Auto-pick por intención del posteo.
// Mismo patrón defensivo: sin módulo, pickStyle devuelve null y nada cambia.
let getStyle = () => null;
let pickStyle = () => null;
let styleFragment = () => '';
let listStyles = () => [];
let intentFromTipo = () => null;
let resolveExplicitIntent = () => ({ intent: null, source: null });
try { ({ getStyle, pickStyle, styleFragment, listStyles, intentFromTipo, resolveExplicitIntent } = require('./image-styles')); }
catch (e) { console.error('[init] image-styles no disponible:', e.message); }
// image-fallback.js: solo se usa brandCardPng (portadas de stories).
// El fallback plano para posteos del feed se eliminó el 2026-10-06
// (Valentino): un bloque de color nunca se muestra como posteo terminado.
let brandCardPng = null;
try { ({ brandCardPng } = require('./image-fallback')); }
catch (e) { console.error('[init] image-fallback no disponible:', e.message); }
// Scroll-stop QA (scrollstop.js) + carousels (carousel.js). Patrón defensivo.
let scoreCanvasCover = null, qaScrollStopB64 = null, SCROLLSTOP_MIN = 60;
try { ({ scoreCanvasCover, qaScrollStopB64, SCROLLSTOP_MIN } = require('./scrollstop')); }
catch (e) { console.error('[init] scrollstop no disponible:', e.message); }
let splitCarouselSlides = null, buildCarouselCaption = (c) => String(c || '');
try { ({ splitCarouselSlides, buildCarouselCaption } = require('./carousel')); }
catch (e) { console.error('[init] carousel no disponible:', e.message); }
// Extras para el system prompt de captions de un usuario: PRIMERO el brief unificado
// (contexto de quién es el cliente), después checklist anti-genérico + voz real.
// Nunca lanza.
function captionExtrasFor(uid) {
  try {
    const parts = [];
    try { const bb = (typeof briefBlockFor === 'function' && briefBlockFor(db, uid)) || ''; if (bb) parts.push(bb); } catch (e) {}
    const rest = (typeof captionPromptExtras === 'function' && captionPromptExtras(db, uid)) || '';
    if (rest) parts.push(rest);
    return parts.join('\n\n');
  }
  catch (e) { return ''; }
}
// Niveles que se sienten (level-boosts.js): el nivel del usuario cambia REALMENTE
// el payload que recibe el modelo, en TODOS los caminos de generación.
// Nunca lanza: ante cualquier falla devuelve el payload original (baseline idéntico).
function levelBoosted(uid, kind, payload) {
  try {
    const { applyLevelBoosts } = require('./level-boosts');
    const lvl = postyLevel(db, uid).level;
    const r = applyLevelBoosts(db, uid, lvl, kind, payload);
    if (r.applied.length) console.log(`[level-boosts] ${kind} uid=${uid} nivel=${lvl}:`, r.applied.map((a) => a.boost).join(', '));
    return r.payload;
  } catch (e) {
    console.error('[level-boosts]:', e.message);
    return payload;
  }
}
const TRIAL_DAYS = 3;
// "Primera semana con rueditas": los primeros borradores de cada cliente pasan
// por revisión (humana o por agente) antes de ser visibles. TRAINING_WHEELS=0 lo
// apaga globalmente (default: prendido).
const TRAINING_WHEELS_ON = process.env.TRAINING_WHEELS !== '0';
const GOLDEN_TARGET = 5; // posteos aprobados para "graduarse" (sacar las rueditas)
// ¿Este usuario todavía necesita revisión en sus borradores? Usuarios con 5+
// publicados o 5+ aprobados ya se graduaron (no molesta a cuentas existentes).
function trainingWheelsActive(uid) {
  if (!TRAINING_WHEELS_ON) return false;
  try {
    const u = db.prepare('SELECT training_wheels FROM users WHERE id = ?').get(uid);
    if (u && u.training_wheels === 0) return false;
    const pub = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'`).get(uid).n || 0;
    if (pub >= GOLDEN_TARGET) return false;
    const gold = db.prepare(`SELECT COUNT(*) AS n FROM golden_examples WHERE user_id = ?`).get(uid).n || 0;
    if (gold >= GOLDEN_TARGET) return false;
    return true;
  } catch (e) { return false; }
}
// Golden examples para few-shot: hasta 3 posteos aprobados (caption + brief visual).
function goldenExamples(uid) {
  try {
    return db.prepare(`SELECT caption, visual_brief FROM golden_examples WHERE user_id = ? ORDER BY created_at DESC LIMIT 3`).all(uid)
      .map(r => ({ caption: String(r.caption || '').slice(0, 600), visual_brief: String(r.visual_brief || '').slice(0, 300) }))
      .filter(g => g.caption);
  } catch (e) { return []; }
}
// Guarda un golden example tras aprobar (caption final + brief visual final).
function saveGoldenExample(uid, postId, caption, visualBrief) {
  try {
    db.prepare(`INSERT INTO golden_examples (user_id, post_id, caption, visual_brief) VALUES (?,?,?,?)`)
      .run(uid, postId || 0, String(caption || '').slice(0, 2000), String(visualBrief || '').slice(0, 500));
  } catch (e) { console.error('[golden] save:', e.message); }
}
// Graduación: con 5+ aprobados se apaga training_wheels para ese usuario.
// FASE 1: la escalera de confianza vive en autopilot.js —
// autopilot.maybeGraduate(db, uid) sube a trust_level=1 (y espeja
// training_wheels=0); autopilot.maybeGraduateLevel2(db, uid) sube a 2.
const mp = require('./mercadopago');
const demo = require('./demo');
const feedAudit = require('./feed-audit');
const { sendEmail, magicLinkEmail } = require('./email');
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

// Analytics propio (tabla events): el frontend manda pantallas y acciones en batch.
// Sin PII en props: solo datos agregados del uso. El tracking nunca bloquea.
function evTrack(userId, name, props = null, sessionId = '') {
  try {
    if (!/^[a-z0-9_]{2,40}$/.test(name)) return;
    let p = '';
    try { p = JSON.stringify(props || {}).slice(0, 2000); } catch (e) {}
    db.prepare('INSERT INTO events (user_id, session_id, name, props) VALUES (?,?,?,?)')
      .run(userId || null, String(sessionId || '').slice(0, 32), name, p);
  } catch (e) { /* el tracking nunca bloquea */ }
}

// Palabras en las que un titular JAMÁS debe terminar: se vería cortado a mitad
// de oración (ej. "Tip: Cómo organizar tu contenido de"). Se chequea sin
// puntuación ni mayúsculas.
const HEADLINE_DANGLING = new Set(['de','del','al','el','la','los','las','un','una','unos','unas','y','e','o','u','ni','que','en','con','por','para','sin','sobre','entre','hasta','desde','durante','a','ante','bajo','contra','hacia','tras','mediante','segun','según','como','cómo','pero','mas','más','si','sí','no','tu','tus','su','sus','mi','mis','nuestro','nuestra','esta','este','esto','es','son','hay','se','le','les','lo','me','te']);
// Quita palabras "colgadas" del final (preposiciones, artículos, conjunciones).
function sinColgada(words) {
  const w = words.slice();
  while (w.length > 1 && HEADLINE_DANGLING.has(String(w[w.length - 1]).toLowerCase().replace(/[.,;:!?¿¡()"“”'']/g, ''))) w.pop();
  return w;
}

// Corta un texto SIN partir palabras a la mitad (nunca "efecti") y SIN dejarlo
// terminado en preposición/artículo (nunca "...tu contenido de").
function cortar(t, max) {
  const s = String(t || '').trim();
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  const i = c.lastIndexOf(' ');
  const cut = (i > max * 0.4 ? c.slice(0, i) : c).trim();
  return sinColgada(cut.split(' ').filter(Boolean)).join(' ');
}

// Titular COMPLETO para renderizar en imágenes: nunca sale cortado a mitad de
// oración. Prefiere la primera oración si entra en el límite; si no, recorta por
// palabras y retrocede hasta una palabra "firme". Tope de caracteres para que el
// brief (que corta en 80) jamás lo mutile.
function makeHeadline(text, maxWords = 6, maxChars = 70) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // Guard 2026-10-06 (propuesta Juli, QA captions): titulares de 1-2 palabras
  // ("Lunes.") no venden y salen del makeHeadline cuando el caption arranca con
  // una escena corta. Se toma la primera oración con >=3 palabras entre las 3
  // primeras; si ninguna califica, se usan las primeras 8 palabras del texto.
  const sentences = (s.match(/[^.!?…]+[.!?…]/g) || [s]).slice(0, 3);
  let seed = sentences.find(c => c.trim().split(' ').filter(Boolean).length >= 3);
  if (!seed) seed = s.split(' ').filter(Boolean).slice(0, 8).join(' ');
  seed = seed.trim();
  // 1) La oración elegida: si entra en el límite de palabras, va entera.
  const fw = seed.split(' ').filter(Boolean);
  let words;
  if (fw.length <= maxWords) {
    words = sinColgada(fw);
  } else {
    // 2) Recorte por palabras + retroceso anti-colgada (sobre la oración elegida).
    words = sinColgada(seed.split(' ').filter(Boolean).slice(0, maxWords));
  }
  let out = words.join(' ');
  // 3) Tope de caracteres, cortando por palabra y re-chequeando colgadas.
  if (out.length > maxChars) {
    const c = out.slice(0, maxChars);
    const i = c.lastIndexOf(' ');
    out = sinColgada((i > maxChars * 0.4 ? c.slice(0, i) : c).trim().split(' ').filter(Boolean)).join(' ');
  }
  return out;
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

// Mudanza de dominio: postahacetodo.com -> postyhacetodo.com (301).
// No toca /api/* (webhooks de MP, OAuth) ni /.well-known/* (assetlinks).
app.use((req, res, next) => {
  const host = (req.get('host') || '').split(':')[0].toLowerCase();
  if ((host === 'postahacetodo.com' || host === 'www.postahacetodo.com') &&
      !req.path.startsWith('/api/') && !req.path.startsWith('/.well-known/')) {
    return res.redirect(301, 'https://postyhacetodo.com' + req.originalUrl);
  }
  next();
});

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
    const u = db.prepare('SELECT plan_status, trial_ends_at, trial_extended_until, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (u && u.plan_status === 'trial' && trialEffectiveEnd(u) <= Date.now())
      return res.status(402).json({ error: 'trial_expired', message: '¡Ey! Se terminó tu prueba gratis 😢 Elegí tu plan y seguimos publicando juntos — Posty te extraña.' });
  } catch (e) {
    // FAIL-CLOSED (2026-10-02): si la DB falla, NO dejamos pasar. Antes dejaba
    // usar la IA sin trial válido ante cualquier error transitorio.
    console.error('[requireTrialValid] DB error, bloqueando por seguridad:', e.message);
    return res.status(503).json({ error: 'tmp_unavailable', message: 'Dame un segundo 😅 Probá de nuevo.' });
  }
  next();
}
// Fin efectivo de la prueba: respeta la política vigente (TRIAL_DAYS desde la creación),
// aunque la cuenta se haya creado cuando la prueba duraba más.
function trialEffectiveEnd(u) {
  // Extensión manual de soporte: si hay una vigente, manda ella (2026-10-03 fix:
  // se chequea PRIMERO, antes el early return por trial_ends_at vacío la ignoraba).
  const ext = u.trial_extended_until || 0;
  if (ext > Date.now()) return ext;
  const tEnds = u.trial_ends_at || 0;
  if (!tEnds) return 0;
  const cMs = Date.parse(String(u.created_at || '').replace(' ', 'T') + 'Z');
  const policyEnd = cMs ? cMs + TRIAL_DAYS * 86400000 : Infinity;
  const base = Math.min(tEnds, policyEnd);
  return base;
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
// Learnings de contenido ("Conocer al cliente a fondo", Track B): qué rinde en el IG del cliente.
// Lee la tabla content_learnings (la crea otro track); si no existe o no hay datos → null, sin romper.
function getContentLearnings(userId) {
  try {
    const r = db.prepare('SELECT learnings_json FROM content_learnings WHERE user_id = ?').get(userId);
    if (r && r.learnings_json) { const o = JSON.parse(r.learnings_json); return (o && typeof o === 'object') ? o : null; }
  } catch (e) {}
  return null;
}
// ===== Track A — ADN extendido: endpoints /api/dna =====
// Whitelist de campos editables del ADN (todo lo demás —series, paused_tipos, etc.— nunca se toca).
const DNA_WHITELIST = ['producto_estrella', 'cliente_ideal', 'diferencial', 'tono',
  'productos', 'servicios', 'promos_activas', 'horarios', 'ubicacion', 'tono_ejemplos', 'preguntas_frecuentes'];
const DNA_SCALARS = ['producto_estrella', 'cliente_ideal', 'diferencial', 'tono', 'horarios', 'ubicacion'];
const DNA_LEGACY = ['producto_estrella', 'cliente_ideal', 'diferencial', 'tono'];
// array -> campo clave para dedupe (null = array de strings).
const DNA_ARRAYS = { productos: 'nombre', servicios: 'nombre', promos_activas: 'titulo', tono_ejemplos: null, preguntas_frecuentes: 'pregunta' };
const DNA_SCHEMA_DOC = `{
  "producto_estrella": "string",
  "cliente_ideal": "string",
  "diferencial": "string",
  "tono": "string",
  "productos": [{"nombre": "string", "precio": "string", "descripcion": "string", "es_estrella": false}],
  "servicios": [{"nombre": "string", "precio": "string", "descripcion": "string"}],
  "promos_activas": [{"titulo": "string", "detalle": "string", "vigencia": "string"}],
  "horarios": "string",
  "ubicacion": "string",
  "tono_ejemplos": ["frase real del dueno"],
  "preguntas_frecuentes": [{"pregunta": "string", "respuesta": "string"}]
}`;
const DNA_EXTRACTION_PROMPT = `Sos un extractor de datos de negocios para una app de marketing. Te paso un texto dictado por el dueno de un negocio. Devolvé SOLO un objeto JSON válido (sin markdown, sin explicaciones) siguiendo este esquema, incluyendo UNICAMENTE los campos que el texto mencione de forma explícita:\n${DNA_SCHEMA_DOC}\nReglas: los arrays van vacíos si no hay nada; NUNCA inventes ni deduzcas datos que no estén en el texto; usá las palabras del dueno cuando sea posible; es_estrella es true solo si el texto dice que ese producto es el principal, estrella o más vendido.`;

function dnaIsEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return !v.length;
  return false;
}
// Campos esenciales del ADN: sin ellos no se genera a ciegas (Track A — gate de ADN).
// Devuelve la lista de los que faltan; [] = ADN completo.
const DNA_ESSENTIAL = ['producto_estrella', 'cliente_ideal', 'diferencial', 'tono'];
function dnaMissingFields(dna) {
  const d = (dna && typeof dna === 'object') ? dna : {};
  return DNA_ESSENTIAL.filter(k => dnaIsEmpty(d[k]));
}
// Merge del ADN extraído sobre el existente. Escalares: se pisan solo si el valor no está vacío;
// los 4 campos legacy no se pisan si ya tienen valor (protectLegacy). Arrays: dedupe por clave,
// existentes primero, tope 20 items.
function mergeExtractedDna(cur, extracted, opts) {
  const protectLegacy = !!(opts && opts.protectLegacy);
  const dna = { ...(cur || {}) };
  for (const k of DNA_SCALARS) {
    const v = extracted ? extracted[k] : undefined;
    if (dnaIsEmpty(v)) continue;
    if (protectLegacy && DNA_LEGACY.includes(k) && !dnaIsEmpty(cur && cur[k])) continue;
    dna[k] = typeof v === 'string' ? v.trim() : v;
  }
  for (const k of Object.keys(DNA_ARRAYS)) {
    const incoming = (extracted && Array.isArray(extracted[k])) ? extracted[k] : [];
    if (!incoming.length) continue;
    const key = DNA_ARRAYS[k];
    const idOf = (it) => (key ? String(((it || {})[key]) || '') : String(it || '')).toLowerCase().trim();
    const existing = (cur && Array.isArray(cur[k])) ? cur[k] : [];
    const seen = new Set();
    for (const it of existing) { const id = idOf(it); if (id) seen.add(id); }
    const merged = [...existing];
    for (const it of incoming) {
      const id = idOf(it);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(it);
      if (merged.length >= 20) break;
    }
    dna[k] = merged;
  }
  return dna;
}
// Intenta parsear JSON; si falla, recorta al substring entre el primer { y el último }.
function parseLooseJson(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  return null;
}
// Extrae ADN estructurado de un texto con una sola llamada a gpt-4o-mini. Devuelve solo claves de la whitelist.
async function extractDnaFromText(text, apiKey) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: DNA_EXTRACTION_PROMPT },
        { role: 'user', content: 'Extraé los datos del negocio de este texto:\n\n' + String(text || '').slice(0, 6000) },
      ],
    }),
  });
  if (!r.ok) throw new Error('openai ' + r.status);
  const j = await r.json();
  costs.trackUsage({ feature: 'dna', model: 'gpt-4o-mini', json: j });
  const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  const parsed = parseLooseJson(content);
  if (!parsed || typeof parsed !== 'object') throw new Error('json inválido');
  const out = {};
  for (const k of DNA_WHITELIST) if (parsed[k] !== undefined) out[k] = parsed[k];
  return out;
}

app.get('/api/dna', requireAuth, (req, res) => {
  res.json({ dna: readDna(req.session.userId) });
});

// ---------- 🧠 Nivel de conocimiento de Posty (GET /api/posty/level) ----------
// Calcula el nivel con datos reales (posty-level.js). El level-up se festeja
// UNA sola vez: se compara con users.posty_level; la primera vez se guarda
// en silencio, y cuando sube se inserta el mensaje en el chat del usuario.
app.get('/api/posty/level', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const computed = postyLevel(db, uid);
    let saved = 0;
    try {
      const r = db.prepare('SELECT posty_level FROM users WHERE id = ?').get(uid);
      saved = (r && r.posty_level) ? Number(r.posty_level) : 0;
    } catch (e) { saved = 0; }
    let leveled_up = false;
    let level_message = null;
    const persist = () => {
      try { db.prepare('UPDATE users SET posty_level = ? WHERE id = ?').run(computed.level, uid); } catch (e) { /* no bloquea */ }
    };
    if (saved <= 0) {
      persist(); // primera vez: guardar silencioso
    } else if (computed.level > saved) {
      const msg = LEVEL_UP_MSGS[computed.level] || null;
      persist();
      if (msg) {
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', msg);
        leveled_up = true;
        level_message = msg;
      }
    }
    res.json({
      ok: true,
      level: computed.level,
      level_name: computed.level_name,
      progress_pct: computed.progress_pct,
      next_missing: computed.next_missing,
      leveled_up,
      level_message,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'No se pudo calcular el nivel' });
  }
});

app.put('/api/dna', requireAuth, (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const filtered = {};
    for (const k of DNA_WHITELIST) if (body[k] !== undefined) filtered[k] = body[k];
    const uid = req.session.userId;
    const dna = mergeExtractedDna(readDna(uid), filtered, { protectLegacy: false });
    writeDna(uid, dna);
    res.json({ dna });
  } catch (e) {
    console.error('[dna] PUT:', e.message);
    res.status(500).json({ error: 'No pude guardar eso 😅 Probá de nuevo que lo reintento con más ganas' });
  }
});

app.post('/api/dna/from-audio', requireAuth, async (req, res) => {
  const audioDataUrl = (req.body && req.body.audioDataUrl) || '';
  if (!String(audioDataUrl).startsWith('data:audio/'))
    return res.status(400).json({ error: 'Falta el audio.' });
  const apiKey = (getSettings(req.session.userId).openai_key) || process.env.OPENAI_API_KEY || '';
  if (!apiKey)
    return res.status(400).json({ error: 'No hay clave de OpenAI configurada. Agregala en Configuración.' });
  let transcript = '';
  try { transcript = await transcribeAudio(audioDataUrl, apiKey); }
  catch (e) {
    console.error('[dna] whisper:', e.message);
    return res.status(400).json({ error: 'No te escuché bien 😅 ¿Me lo mandás de nuevo?' });
  }
  if (!transcript)
    return res.status(400).json({ error: 'No se entendió el audio. Probá de nuevo.' });
  try {
    const extracted = await extractDnaFromText(transcript, apiKey);
    const uid = req.session.userId;
    const dna = mergeExtractedDna(readDna(uid), extracted, { protectLegacy: true });
    writeDna(uid, dna);
    res.json({ transcript, extracted, dna });
  } catch (e) {
    console.error('[dna] extracción:', e.message);
    res.status(400).json({ error: 'Ese audio me vino fallado 😅 Probá mandarlo de nuevo' });
  }
});

app.post('/api/dna/from-text', requireAuth, async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'Falta el texto.' });
  const apiKey = (getSettings(req.session.userId).openai_key) || process.env.OPENAI_API_KEY || '';
  if (!apiKey)
    return res.status(400).json({ error: 'No hay clave de OpenAI configurada. Agregala en Configuración.' });
  try {
    const extracted = await extractDnaFromText(text, apiKey);
    const uid = req.session.userId;
    const dna = mergeExtractedDna(readDna(uid), extracted, { protectLegacy: true });
    writeDna(uid, dna);
    res.json({ extracted, dna });
  } catch (e) {
    console.error('[dna] extracción:', e.message);
    res.status(400).json({ error: 'Me mareé con ese texto 😅 Probá de nuevo' });
  }
});
// ===== Fin Track A — ADN extendido =====
// Track A — gate "no generar a ciegas": ¿tiene el cliente lo esencial del ADN cargado?
// Esencial = producto_estrella, cliente_ideal, diferencial, tono.
app.get('/api/dna/status', requireAuth, (req, res) => {
  const missing = dnaMissingFields(readDna(req.session.userId));
  res.json({ ok: true, complete: !missing.length, missing });
});
// Inspiración visual del cliente (referencia de estilo): el cliente sube un
// posteo de Instagram que le gusta → visión gpt-4o analiza el estilo (tono,
// tipografía, colores, composición, ritmo del texto) y se guarda en
// business_dna.dna_json.inspo con MERGE (no pisa el resto del ADN).
app.post('/api/dna/inspo', requireAuth, express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
  try {
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'Imagen vacía' });
    const ct = req.get('Content-Type') || 'image/jpeg';
    const apiKey = (getSettings(req.session.userId).openai_key) || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ error: 'No hay clave de OpenAI configurada. Agregala en Configuración.' });
    const b64 = Buffer.from(req.body).toString('base64');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.5,
        max_tokens: 300,
        messages: [
          { role: 'system', content:
`Sos un director de arte publicitario. Mirá esta imagen de referencia (un posteo de Instagram que le gusta a un cliente) y describí su ESTILO VISUAL en 2 o 3 líneas cortas, en español rioplatense: tono general de la pieza, tipografía (estilo y presencia), paleta de colores, composición y cuánto texto lleva la imagen. Devolvé SOLO la descripción, sin introducciones ni conclusiones.` },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${ct};base64,${b64}` } },
            { type: 'text', text: 'Describí el estilo visual de esta imagen.' },
          ] },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`openai ${r.status}: ${t.slice(0, 120)}`);
    }
    const j = await r.json().catch(() => null);
    costs.trackUsage({ feature: 'dna', userId: req.session.userId, model: 'gpt-4o', json: j });
    const estilo = ((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    if (!estilo) throw new Error('OpenAI no devolvió análisis');
    // MERGE: igual que el ```inspo del chat — no pisa producto_estrella, series, pausas ni nada más.
    const uid = req.session.userId;
    const dna = readDna(uid);
    dna.inspo = estilo.slice(0, 500);
    writeDna(uid, dna);
    res.json({ ok: true, estilo: dna.inspo });
  } catch (e) {
    console.error('[dna/inspo]', e.message);
    res.status(500).json({ error: 'No pudimos analizar esa imagen. Probá con otra foto.' });
  }
});
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
  // Medición: whisper se cobra por minuto; estimamos duración del audio de forma
  // aproximada (asumiendo ~64kbps). Es solo para medir el quemado, no facturación.
  try {
    const minutes = Math.max(0.05, (buf.length * 8 / 64000) / 60);
    costs.logApiCost({ userId: null, feature: 'whisper', model: 'whisper-1', minutes });
  } catch (e) {}
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
// ¿El posteo i-ésimo de la prueba usa una FOTO REAL del cliente?
// En /prueba la imagen final se renderiza (PNG), así que la marca de "foto
// real" vive en el spec guardado (out.design.posts[i].photo), paralelo a
// out.posts[i]:
//   - {userPhoto:true}  → foto subida en el formulario de /prueba
//   - "data:image/..."   → foto subida después por rediseño (va en el cache)
//   - ruta de archivo    → foto de stock (no es del cliente)
// En payloads viejos sin design: si subió foto (out.screenshot), TODOS los
// posteos la usan (buildDemoSpec marca {userPhoto:true} en cada uno).
function trialPostUsesClientPhoto(out, i) {
  try {
    const sp = (out.design && Array.isArray(out.design.posts) && out.design.posts[i]) || null;
    if (sp) {
      const ph = sp.photo;
      if (ph && typeof ph === 'object' && ph.userPhoto) return true;
      if (typeof ph === 'string' && ph.indexOf('data:image/') === 0) return true;
      return false;
    }
  } catch (e) {}
  return !!(out && out.screenshot);
}

// Importa la semana generada en /prueba a la cuenta nueva: los posteos quedan
// como borradores (nada se publica sin su OK). Lee del trial_cache por @,
// así no se re-suben los archivos desde el navegador.
// Marca source='trial' (marcador confiable de "semana importada de la prueba")
// y client_photo=1 en los posteos que usan fotos reales del cliente.
// expectedBusiness (opcional): si se pasa, la semana cacheada tiene que ser de
// ese negocio — si es de otro (cache cruzado), NO se importa nada.
function importTrialWeek(userId, igRaw, expectedBusiness) {
  const ig = String(igRaw || '').trim().replace(/^@/, '').toLowerCase();
  if (!ig) return 0;
  const hit = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(ig);
  if (!hit) return 0;
  let out;
  try { out = JSON.parse(hit.payload); } catch (e) { return 0; }
  const exp = String(expectedBusiness || '').trim().toLowerCase();
  if (exp) {
    const got = String((out && out.business) || '').trim().toLowerCase();
    if (got !== exp) {
      console.log(`[posta] importTrialWeek: semana de @${ig} es de otro negocio ("${out && out.business}") — no se importa`);
      return 0;
    }
  }
  const posts = (out.posts || []).filter((p) => p && (p.image || p.video));
  if (!posts.length) return 0;
  if (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(userId).c) return 0;
  let n = 0;
  let idx = -1;
  for (const p of posts.slice(0, 7)) {
    idx++;
    try {
      const isVideo = p.type === 'video' && p.video;
      const m = /^data:(image\/(png|jpeg|webp)|video\/mp4);base64,([\s\S]+)$/.exec(String(isVideo ? p.video : p.image || ''));
      if (!m) continue;
      const ext = m[1] === 'video/mp4' ? 'mp4' : (m[2] === 'jpeg' ? 'jpg' : m[2]);
      const buf = Buffer.from(m[3], 'base64');
      if (!buf.length || buf.length > 15 * 1024 * 1024) continue;
      const name = `trial-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
      const clientPhoto = trialPostUsesClientPhoto(out, idx) ? 1 : 0;
      db.prepare(
        'INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, needs_review, source, client_photo) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(userId, `/media/${name}`, String(p.caption || ''), String(p.hashtags || ''), 'draft', isVideo ? 'video' : 'image', trainingWheelsActive(userId) ? 1 : 0, 'trial', clientPhoto);
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

// Fix auditoría #2 (2026-09-30): registra el resultado REAL de importTrialWeek
// (el conteo que devuelve, no una suposición).
//   NULL  = no vino de /prueba con @        → welcome actual
//   0     = vino pero la importación trajo 0 (cache vencido / payload roto)
//           → welcome honesto + 1 tap para rearmar
//   >0    = posteos importados              → welcome de continuidad
// No pisa un éxito previo con un 0 posterior: si el usuario ya tenía posteos,
// el import no se intentó (hadPostsBefore) y no se registra nada.
function recordTrialImport(userId, trialIg, nImp, hadPostsBefore) {
  const ig = String(trialIg || '').trim().replace(/^@/, '');
  if (!ig || hadPostsBefore) return;
  try {
    db.prepare(`UPDATE users SET trial_import_n = CASE
      WHEN ? > 0 THEN ?
      WHEN trial_import_n IS NULL THEN 0
      ELSE trial_import_n END WHERE id = ?`).run(nImp, nImp, userId);
  } catch (e) { console.error('[posta] recordTrialImport:', e.message); }
}

app.post('/api/auth/register', (req, res) => {
  const { email, password, ref, trial_ig, utm } = req.body || {};
  if (!email || !password || password.length < 6)
    return res.status(400).json({ error: 'Necesito tu email y una contraseña de 6 caracteres como mínimo 🔑' });
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
    const utmS = String((utm && utm.source) || '').slice(0, 40);
    const utmC = String((utm && utm.campaign) || '').slice(0, 80);
    const r = db.prepare('INSERT INTO users (email, password_hash, referral_code, referred_by, trial_ends_at, utm_source, utm_campaign) VALUES (?, ?, ?, ?, ?, ?, ?)').run(email.trim().toLowerCase(), hash, code, referredBy, trialEnds, utmS, utmC);
    req.session.userId = r.lastInsertRowid;
    // Si viene de /prueba con el mismo @, su semana generada lo espera adentro como borradores
    try {
      const nImp = importTrialWeek(r.lastInsertRowid, trial_ig);
      if (nImp) console.log(`[posta] semana de prueba importada: ${nImp} borradores → usuario ${r.lastInsertRowid}`);
      recordTrialImport(r.lastInsertRowid, trial_ig, nImp, false); // fix #2: usuario nuevo, sin posteos previos
      streakFromTrialImport(r.lastInsertRowid, nImp);
      // 🚀 Abrir y listo: la semana se arma SOLA (historias + programación + aviso).
      // Fire-and-forget: la respuesta ya casi sale, esto no la bloquea.
      if (nImp && autoWeekEnabled(r.lastInsertRowid)) {
        const uidNew = r.lastInsertRowid;
        setTimeout(() => { autoArmWeek(uidNew, 'signup').catch(() => {}); }, 5000);
      }
    } catch (e) { console.error('[posta] importTrialWeek:', e.message); }
    track(r.lastInsertRowid, 'registered');
    evTrack(r.lastInsertRowid, 'account_created', {});
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Ese email ya tiene cuenta 😄 Probá entrando directamente' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, trial_ig } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !user.password_hash || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Mmm, ese email o contraseña no me cierran 🤔 Probá de nuevo' });
  req.session.userId = user.id;
  // Si viene de /prueba y ya tenía cuenta, su semana también lo espera adentro
  try {
    const uidL = user.id;
    const hadPosts = (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uidL).c || 0) > 0;
    const nImp = importTrialWeek(uidL, trial_ig);
    if (nImp) console.log(`[posta] semana de prueba importada (login): ${nImp} borradores → usuario ${uidL}`);
    recordTrialImport(uidL, trial_ig, nImp, hadPosts); // fix #2: no pisar con un 0 si el import no se intentó
    streakFromTrialImport(uidL, nImp);
    // 🚀 Abrir y listo (login con semana importada): también se arma sola.
    if (nImp && !hadPosts && autoWeekEnabled(uidL)) {
      setTimeout(() => { autoArmWeek(uidL, 'login').catch(() => {}); }, 5000);
    }
  } catch (e) { console.error('[posta] importTrialWeek:', e.message); }
  res.json({ ok: true });
});

// ---------- Magic link (entrar sin contraseña) ----------
// Aplica el perfil de la prueba a un usuario NUEVO, espejando lo que hoy hace
// el cliente de prueba.html tras /api/auth/register (mismo catMap, mismos
// topes, mismos defaults). La data viaja dentro del token (15 min de vida),
// así que siempre es fresca: no necesita el chequeo de 24h del localStorage.
function applyTrialProfile(userId, tp) {
  if (!tp || typeof tp !== 'object') return;
  try {
    const catMap = { moda: 'ropa', gastronomia: 'gastronomia', belleza: 'belleza', fitness: 'fitness', mascotas: 'mascotas', salud: 'salud', hogar: 'hogar', inmobiliaria: 'inmobiliaria', autos: 'servicios', educacion: 'educacion', turismo: 'viajes', eventos: 'eventos', tecnologia: 'tecnologia', deco: 'hogar', joyeria: 'otro', fotografia: 'arte', profesionales: 'servicios', flores: 'otro', bar: 'gastronomia', cafeteria: 'cafeteria', barberia: 'barberia', servicios: 'servicios', viajes: 'viajes', arte: 'arte', otro: 'otro' };
    const businessName = String(tp.business_name || '').slice(0, 80);
    if (businessName) {
      getProfile(userId);
      db.prepare(
        `UPDATE profiles SET business_name=?, category=?, tone=?, description=?, ig_username=?, competitors=?, goal=?, updated_at=datetime('now') WHERE user_id=?`
      ).run(
        businessName,
        catMap[tp.category] || 'otro',
        tp.tone === 'tu' ? 'profesional' : 'canchero',
        String(tp.description || '').slice(0, 600),
        String(tp.ig_username || '').slice(0, 40),
        String(tp.competitors || '').slice(0, 200),
        'vender',
        userId
      );
    }
    // brand_colors: mismo formato que /api/settings (JSON de hex válidos, >= 2)
    const bc = (tp.brand_colors || []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
    if (bc.length >= 2) {
      getSettings(userId);
      db.prepare(`UPDATE settings SET brand_colors=?, updated_at=datetime('now') WHERE user_id=?`)
        .run(JSON.stringify(bc.slice(0, 3)), userId);
    }
  } catch (e) { console.error('[magic] trial_profile:', e.message); }
}

// Siempre responde {ok:true} para no revelar si el email existe.
app.post('/api/auth/magic-request', async (req, res) => {
  const { email, trial_ig, ref, utm, trial_profile } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) return res.json({ ok: true });
    // Rate limit: máx 5 tokens por hora por email
    const hourAgo = Date.now() - 3600 * 1000;
    const n = db.prepare('SELECT COUNT(*) AS c FROM magic_tokens WHERE email = ? AND created_at >= ?').get(em, hourAgo).c;
    if (n >= 5) return res.json({ ok: true });
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const payload = JSON.stringify({
      trial_ig: trial_ig || null,
      ref: ref || null,
      utm: utm || null,
      trial_profile: trial_profile || null,
    });
    db.prepare('INSERT INTO magic_tokens (token_hash, email, payload, created_at, expires_at, used) VALUES (?,?,?,?,?,0)')
      .run(tokenHash, em, payload, Date.now(), Date.now() + 15 * 60 * 1000);
    if (process.env.RESEND_API_KEY) {
      const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
      const link = `${base}/api/auth/magic?token=${token}`;
      try { await magicLinkEmail(em, link); }
      catch (e) { console.error('[magic] email:', e.message); }
    }
  } catch (e) { console.error('[magic] request:', e.message); }
  res.json({ ok: true });
});

// Canjea el magic link: token de un solo uso, 15 min de vida.
// Usuario nuevo → se crea espejando /api/auth/register (sin contraseña:
// password_hash queda vacío y el login con contraseña da 401, nunca 500).
// Usuario existente → solo entra (+ importa la semana de /prueba si hay).
app.get('/api/auth/magic', (req, res) => {
  const token = String((req.query && req.query.token) || '');
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = db.prepare('SELECT * FROM magic_tokens WHERE token_hash = ? AND used = 0').get(tokenHash);
    if (!row || row.expires_at < Date.now())
      return res.status(400).send('Ese link venció o ya se usó 😅 Pedí uno nuevo desde la app');
    db.prepare('UPDATE magic_tokens SET used = 1 WHERE token_hash = ?').run(tokenHash);
    let payload = {};
    try { payload = JSON.parse(row.payload || '{}'); } catch (e) {}
    const email = row.email;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const code = newReferralCode();
      let referredBy = null;
      const refCode = String(payload.ref || '').trim().toLowerCase().slice(0, 16);
      if (/^[a-z0-9]{4,16}$/.test(refCode)) {
        const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(refCode);
        if (referrer && referrer.id) referredBy = referrer.id;
      }
      const trialEnds = Date.now() + TRIAL_DAYS * 24 * 3600 * 1000;
      const utm = (payload.utm && typeof payload.utm === 'object') ? payload.utm : {};
      const utmS = String(utm.source || '').slice(0, 40);
      const utmC = String(utm.campaign || '').slice(0, 80);
      const r = db.prepare("INSERT INTO users (email, password_hash, referral_code, referred_by, trial_ends_at, utm_source, utm_campaign) VALUES (?, '', ?, ?, ?, ?, ?)")
        .run(email, code, referredBy, trialEnds, utmS, utmC);
      const userId = r.lastInsertRowid;
      try {
        // El negocio esperado sale del perfil de la prueba (lo que el usuario
        // escribió en SU navegador): si la semana cacheada es de otro negocio,
        // no se importa (bug 2026-10-03).
        const expBiz = (payload.trial_profile && payload.trial_profile.business_name) || null;
        const nImp = importTrialWeek(userId, payload.trial_ig, expBiz);
        if (nImp) console.log(`[posta] semana de prueba importada (magic): ${nImp} borradores → usuario ${userId}`);
        recordTrialImport(userId, payload.trial_ig, nImp, false); // fix #2: usuario nuevo, sin posteos previos
        streakFromTrialImport(userId, nImp);
      } catch (e) { console.error('[posta] importTrialWeek:', e.message); }
      applyTrialProfile(userId, payload.trial_profile);
      track(userId, 'registered');
      evTrack(userId, 'account_created', {});
      req.session.userId = userId;
    } else {
      req.session.userId = user.id;
      try {
        const hadPosts = (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(user.id).c || 0) > 0;
        const expBiz = (payload.trial_profile && payload.trial_profile.business_name) || null;
        const nImp = importTrialWeek(user.id, payload.trial_ig, expBiz);
        if (nImp) console.log(`[posta] semana de prueba importada (magic, login): ${nImp} borradores → usuario ${user.id}`);
        recordTrialImport(user.id, payload.trial_ig, nImp, hadPosts); // fix #2: no pisar con un 0 si el import no se intentó
        streakFromTrialImport(user.id, nImp);
      } catch (e) { console.error('[posta] importTrialWeek:', e.message); }
    }
    return res.redirect('/#/app/semana');
  } catch (e) {
    console.error('[magic] redeem:', e.message);
    return res.status(400).send('Ese link no me cierra 😅 Pedí uno nuevo desde la app');
  }
});

// ---------- Recuperar contraseña ----------
try { db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0
)`); } catch (e) {}

// Siempre responde OK para no revelar si el email existe.
app.post('/api/auth/forgot', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  try {
    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    if (user && process.env.RESEND_API_KEY) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
      db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)')
        .run(user.id, tokenHash, Date.now() + 3600 * 1000);
      const host = (req.get('host') || 'postyhacetodo.com').split(':')[0];
      const link = `https://${host}/#/reset?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Recuperá tu contraseña 🔑',
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
          <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
            <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
          </div>
          <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
            <p style="font-size:16px;line-height:1.6">¡Hola! Soy Posty 🤖 Me pediste cambiar tu contraseña. Tocá el botón y elegí una nueva:</p>
            <p style="text-align:center;margin:26px 0"><a href="${link}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:16px;padding:14px 34px;border-radius:999px;text-decoration:none">Cambiar mi contraseña</a></p>
            <p style="font-size:13px;line-height:1.6;color:#47617A">El link vence en 1 hora. Si no fuiste vos, ignorá este mail 😊</p>
          </div></div>`,
      });
    }
  } catch (e) { console.error('[posta] forgot:', e.message); }
  res.json({ ok: true });
});

app.post('/api/auth/reset', (req, res) => {
  const token = String((req.body && req.body.token) || '');
  const password = String((req.body && req.body.password) || '');
  if (!token || password.length < 6)
    return res.status(400).json({ error: 'Necesito el link válido y una contraseña de 6 caracteres como mínimo 🔑' });
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0').get(tokenHash);
    if (!row || row.expires_at < Date.now())
      return res.status(400).json({ error: 'Ese link venció o ya se usó 😅 Pedí uno nuevo' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
    req.session.userId = row.user_id;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'No pude cambiarla 😅 Probá de nuevo' });
  }
});

// ---------- Nudges proactivos de Posty (pide por chat, ~1/semana) ----------
// Posty pregunta en el chat lo que le falta: foto del producto, nota de voz, referencia de estilo.
try { db.exec(`CREATE TABLE IF NOT EXISTS posty_nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  shown_at INTEGER DEFAULT 0,
  done_at INTEGER DEFAULT 0
)`); } catch (e) {}

function nudgeMissing(uid) {
  // Kind más prioritario que le falta al usuario (foto > voz > estilo), o null.
  try {
    const done = new Set(db.prepare(`SELECT kind FROM posty_nudges WHERE user_id = ? AND done_at > 0`).all(uid).map(r => r.kind));
    const photo = db.prepare(`SELECT id FROM assets WHERE user_id = ? AND kind = 'photo' LIMIT 1`).get(uid);
    if (!photo && !done.has('photo')) return 'photo';
    let j = {};
    try { const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid); j = JSON.parse((r && r.dna_json) || '{}'); } catch (e) {}
    const hasDesc = String(j.descripcion || j.description || j.negocio || j.business_description || '').trim().length > 20;
    if (!hasDesc && !done.has('voice')) return 'voice';
    if (!String(j.inspo || '').trim() && !done.has('inspo')) return 'inspo';
  } catch (e) {}
  return null;
}

app.get('/api/nudges/pending', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const n = db.prepare(`SELECT * FROM posty_nudges WHERE user_id = ? AND shown_at = 0 AND done_at = 0 ORDER BY id ASC LIMIT 1`).get(uid);
    if (!n) return res.json({ nudge: null });
    // Re-validar: si ya lo resolvió por otro lado, marcar hecho y no mostrar.
    const stillMissing = nudgeMissing(uid);
    if (stillMissing !== n.kind) {
      db.prepare(`UPDATE posty_nudges SET done_at = ? WHERE id = ?`).run(Date.now(), n.id);
      return res.json({ nudge: null });
    }
    db.prepare(`UPDATE posty_nudges SET shown_at = ? WHERE id = ?`).run(Date.now(), n.id);
    res.json({ nudge: { id: n.id, kind: n.kind } });
  } catch (e) { res.json({ nudge: null }); }
});

app.post('/api/nudges/done', requireAuth, (req, res) => {
  try {
    const kind = String((req.body && req.body.kind) || '');
    if (kind) db.prepare(`UPDATE posty_nudges SET done_at = ? WHERE user_id = ? AND kind = ? AND done_at = 0`).run(Date.now(), req.session.userId, kind);
  } catch (e) {}
  res.json({ ok: true });
});
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
  { key: 'fotos', pregunta: '📸 Última: subí hasta 5 fotos de tu negocio — tu local, tus productos, vos laburando. Con esas fotos la IA aprende cómo se ve lo que hacés y te genera contenido nuevo cada semana, sin que tengas que pensar en fotos. Sacalas con luz de día si podés ☀️ Si preferís, escribí "saltear".' },
];
const OB_GOAL_CHIPS = ['Vender más', 'Conseguir seguidores', 'Llenar mi local', 'Contar novedades'];
const OB_GREETING = '¡Hola! Soy Posty, tu community manager 🙌 Te hago unas preguntas rápidas para conocer tu negocio a fondo y armarte todo. Son 8, dale que va:';

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
                { role: 'system', content: `Sos Posty, el community manager personal de este negocio, entrevistando a su dueño para conocerlo a fondo. Tu nombre es Posty, siempre: nunca digas "Posta". Ya van ${userCount} de ${OB_STEPS.length} preguntas. El dueño acaba de responder: "${(lastUser.text || '').slice(0, 300)}". Escribí 1-2 líneas en español rioplatense con voseo: primero un acuse cálido y ESPECÍFICO de lo que dijo (nada genérico), y después hacé la siguiente pregunta: "${step.pregunta}". Si su respuesta fue evasiva ("no sé", "saltear", vacía o de una palabra), no insistas: pasá a la siguiente con buena onda. Nunca hagas más de una pregunta.` },
              ],
              max_tokens: 220, temperature: 0.8,
            }),
            signal: AbortSignal.timeout(20000),
          });
          const j = await r.json();
          costs.trackUsage({ feature: 'onboarding', userId: req.session.userId, model: 'gpt-4o-mini', json: j });
          const txt = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
          reply = cortar(txt, 500) || `¡Buenísimo! ${step.pregunta}`;
        } catch (e) { reply = `¡Buenísimo! ${step.pregunta}`; }
      }
    }
    res.json({
      ok: true, done: false, reply, answered: userCount,
      chips: step.key === 'objetivo' ? OB_GOAL_CHIPS : null,
      awaitLogo: step.key === 'logo',
      awaitPhotos: step.key === 'fotos',
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
        costs.trackUsage({ feature: 'onboarding', userId: req.session.userId, model: 'gpt-4o-mini', json: j });
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

// ---------- Push notifications (Web Push / VAPID) ----------
// Clave pública VAPID para que el frontend pueda suscribirse.
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ key: push.vapidPublicKey() });
});
// Guardar/actualizar la suscripción push de este dispositivo.
// Fase 2 Tiendas: acepta transport ('webpush'|'fcm'|'apns') y token.
// webpush (default): endpoint https:// + keys → flujo original, intacto.
// fcm/apns: se guarda endpoint=token, keys_json='{}' (contrato en push.js).
app.post('/api/push/subscribe', requireAuth, (req, res) => {
  try {
    const { endpoint, keys, transport, token } = req.body || {};
    const t = (transport === 'fcm' || transport === 'apns') ? transport : 'webpush';
    push.ensureTransportColumn(db);
    if (t !== 'webpush') {
      const tok = (typeof token === 'string' && token.trim()) || (typeof endpoint === 'string' && endpoint.trim()) || '';
      if (!tok) return res.status(400).json({ error: 'Suscripción inválida' });
      db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport)
        VALUES (?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json, transport = excluded.transport`).run(req.session.userId, tok, '{}', t);
      return res.json({ ok: true, transport: t });
    }
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }
    const keysJson = JSON.stringify(keys && typeof keys === 'object' ? keys : {});
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport)
      VALUES (?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json, transport = excluded.transport`).run(req.session.userId, endpoint, keysJson, t);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo guardar la suscripción' });
  }
});
// Dar de baja este dispositivo.
app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(req.session.userId, endpoint);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true });
  }
});

// ---------- Play Store (TWA): Digital Asset Links ----------
// Valida que la app Android es dueña de postyhacetodo.com. El SHA-256 sale de
// Play App Signing cuando Valentino cree la app (ver STORES.md). Se puede pegar
// el JSON completo en la env ASSETLINKS_JSON; si no, se sirve el placeholder.
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fromEnv = (process.env.ASSETLINKS_JSON || '').trim();
  if (fromEnv) {
    try {
      res.type('application/json').send(JSON.parse(fromEnv));
      return;
    } catch (e) { console.error('[assetlinks] ASSETLINKS_JSON inválido:', e.message); }
  }
  res.type('application/json').send([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.postyhacetodo.app',
      sha256_cert_fingerprints: ['REEMPLAZAR_CON_SHA256_PLAY'],
    },
    _nota: 'Placeholder: reemplazar el fingerprint con el de Play App Signing (ver STORES.md). Sin el fingerprint real, la TWA abre en pestaña de Chrome en vez de pantalla completa.',
  }]);
});

// ---------- Apple (Universal Links): apple-app-site-association ----------
// Sin redirects y con content-type application/json (Apple lo exige).
// appID = Team ID de Valentino (V86JY9BJR3) + bundle ID iOS.
app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.type('application/json').send({
    applinks: { apps: [], details: [{ appID: 'V86JY9BJR3.com.postyhacetodo.app', paths: ['*'] }] },
    webcredentials: { apps: ['V86JY9BJR3.com.postyhacetodo.app'] },
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, created_at, plan, plan_status, mp_preapproval_id, mp_payer_email, trial_ends_at, trial_extended_until, email_verified FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json({ user: null });
  const plan = getPlan(user.plan_status === 'active' ? user.plan : TRIAL_PLAN);
  const nowMs = Date.now();
  const tEnds = trialEffectiveEnd(user);
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
  if (!(business_name || '').trim()) return res.status(400).json({ error: '¿Cómo se llama tu negocio? Lo necesito para arrancar 🏪' });
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

// ---------- Autopiloto (4 puntos, 2026-10-02; FASE 1, 2026-10-05) ----------
// GET estado, POST toggle. FASE 1: la fuente de verdad es trust_level
// (autopilot_enabled queda espejado de trust_level>=2). clean_approvals y
// autopilot_offered se mantienen como columnas/lecturas pero ya no son gates.
app.get('/api/autopilot', requireAuth, (req, res) => {
  try {
    const u = db.prepare('SELECT autopilot_enabled, clean_approvals, autopilot_offered, trust_level, autopilot_prenotify FROM users WHERE id = ?').get(req.session.userId);
    const clean = (u && u.clean_approvals) || 0;
    const tl = autopilot.trustLevel(db, req.session.userId);
    res.json({
      ok: true,
      enabled: !!(u && u.autopilot_enabled),
      clean_approvals: clean,
      unlocked: tl >= 2 || clean >= 10 || !!(u && u.autopilot_offered) || !!(u && u.autopilot_enabled),
      progress: Math.min(10, clean),
      trust_level: tl,
      // En nivel 1 el aviso pre-publicación es obligatorio (freno de
      // emergencia); en nivel 2 es opt-in.
      pre_notify: tl >= 2 ? !!((u && u.autopilot_prenotify)) : true,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No pude leer el estado 😅' });
  }
});
// 🚀 Abrir y listo: toggle "Posty arma mi semana solo" (default ON).
app.get('/api/settings/auto-week', requireAuth, (req, res) => {
  res.json({ ok: true, enabled: autoWeekEnabled(req.session.userId) });
});
app.post('/api/settings/auto-week', requireAuth, express.json(), (req, res) => {
  const on = !!((req.body || {}).enabled);
  db.prepare('UPDATE users SET auto_week = ? WHERE id = ?').run(on ? 1 : 0, req.session.userId);
  console.log(`[auto-week] usuario ${req.session.userId} ${on ? 'ACTIVÓ' : 'apagó'} el armado automático`);
  res.json({ ok: true, enabled: on });
});

app.post('/api/autopilot', requireAuth, express.json(), (req, res) => {
  try {
    const enabled = !!req.body.enabled;
    const uid = req.session.userId;
    if (enabled) {
      // Opt-in explícito al autopiloto pleno: sube directo al nivel 2.
      db.prepare(`UPDATE users SET autopilot_enabled = 1, trust_level = CASE WHEN COALESCE(trust_level, 0) < 2 THEN 2 ELSE trust_level END WHERE id = ?`).run(uid);
    } else {
      // Apagarlo baja al nivel 1: sigue publicando solo pero con el aviso
      // pre-publicación como freno de emergencia (puede frenar cada posteo).
      db.prepare(`UPDATE users SET autopilot_enabled = 0, trust_level = CASE WHEN COALESCE(trust_level, 0) > 1 THEN 1 ELSE trust_level END WHERE id = ?`).run(uid);
    }
    console.log(`[autopilot] usuario ${uid} ${enabled ? 'ACTIVÓ' : 'desactivó'} el autopiloto`);
    res.json({ ok: true, enabled });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No pude guardarlo 😅' });
  }
});
// Opt-in del aviso pre-publicación (30 min antes) en nivel 2. En nivel 1 el
// aviso es obligatorio y este toggle no tiene efecto.
app.post('/api/autopilot/pre-notify', requireAuth, express.json(), (req, res) => {
  try {
    const on = !!((req.body || {}).enabled);
    db.prepare(`UPDATE users SET autopilot_prenotify = ? WHERE id = ?`).run(on ? 1 : 0, req.session.userId);
    console.log(`[autopilot] usuario ${req.session.userId} ${on ? 'ACTIVÓ' : 'apagó'} el aviso pre-publicación`);
    res.json({ ok: true, pre_notify: on });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No pude guardarlo 😅' });
  }
});
// Chequear calidad de un borrador sin publicarlo.
app.get('/api/posts/:id/quality', requireAuth, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.session.userId);
    if (!post) return res.status(404).json({ ok: false, error: 'No encontrado' });
    const result = autopilot.qualityGate(post, db, MEDIA_DIR);
    autopilot.saveQualityResult(db, post.id, result);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'No pude chequearlo 😅' });
  }
});

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

// Style Lock visual: re-analiza la estética del feed de Instagram del cliente.
// Nunca devuelve 500: errores → {ok:false, reason}.
app.post('/api/style-visual/analyze', requireAuth, async (req, res) => {
  try { const r = await analyzeVisualStyle(db, req.session.userId); res.json(r); }
  catch (e) { res.json({ ok:false, error: e.message }); }
});

// Caption Style Lock: re-analiza cómo escribe el cliente en su Instagram.
// Nunca devuelve 500: errores → {ok:false, error}.
app.post('/api/caption-style/analyze', requireAuth, async (req, res) => {
  try { const r = await analyzeCaptionStyle(db, req.session.userId); res.json(r); }
  catch (e) { res.json({ ok:false, error: e.message }); }
});

// Brief Unificado: re-mina la bio del IG y reconstruye el brief del cliente
// (NEGOCIO + VOZ + VISUAL + MARCA). Nunca devuelve 500.
app.post('/api/client-brief/refresh', requireAuth, async (req, res) => {
  try { const r = await refreshClientBrief(db, req.session.userId); res.json(r); }
  catch (e) { res.json({ ok:false, error: e.message }); }
});

// ---------- Generador ----------
app.post('/api/generate', requireAuth, requireTrialValid, async (req, res) => {
  const { topic, n, seed, tipo } = req.body || {};
  if (!topic || !topic.trim()) return res.status(400).json({ error: 'Contame de qué es el posteo y lo armamos juntos ✍️' });
  const count = Math.min(3, Math.max(1, parseInt(n, 10) || 1));
  try {
    const input = contentInputFor(req.session.userId, topic, tipo, seed);
    const key = openaiKeyFor(req.session.userId);
    if (count > 1) {
      const out = await generateCaptions(input, count, key);
      (out.hookIds || []).forEach(h => recordHookUse(req.session.userId, h));
      return res.json(out); // { captions: [...], hashtags }
    }
    const out = await generateContent(input, key);
    recordHookUse(req.session.userId, out && out.hookId);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: 'Se me trabó la creatividad 😅 Probá de nuevo que esta sale' });
  }
});

// ---------- Creador v2: 6 opciones con foto, colores y energía ----------
app.post('/api/creator/options', requireAuth, async (req, res) => {
  const { topic, feedback, productPhoto } = req.body || {};
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'Tirame tu idea y la hacemos realidad 💡' });
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
    res.status(500).json({ error: e.message || 'No pude armar las opciones 😅 Probá de nuevo' });
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
    return res.status(400).json({ error: 'Elegí al menos un diseño para seguir 👆' });
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
// FM #5: si el publish quedó en revisión o falló, el festejo del modelo
// ("¡ya está saliendo!") no puede quedar: se corrige el reply ANTES de responder.
// (El reply se arma después de procesar los bloques, justo antes del res.json.)
function fixPublishReply(reply, publishApplied) {
  if (!publishApplied) return reply;
  const inR = (publishApplied.inReview || []).length;
  const fail = (publishApplied.failed || []).length;
  if (!inR && !fail) return reply;
  const ok = (publishApplied.ok || []).length;
  if (!ok) {
    return inR
      ? 'Quedó en revisión antes de salir — lo reviso y te aviso en cuanto se publique 🙏'
      : 'No llegó a salir a Instagram — reviso qué pasó y te aviso 🙏';
  }
  return String(reply || '') + (inR ? ' (uno quedó en revisión, te aviso cuando salga)' : ' (uno no pudo salir, lo reviso y te aviso)');
}
app.post('/api/ideas/chat', requireAuth, requireTrialValid, async (req, res) => {
  const { messages, photos, library, drafts, audio } = req.body || {};
  const uidChat = req.session.userId;
  // Kill-switch de gasto diario: mensaje amable de Posty, nunca un error robótico.
  try { costs.assertAiOk(uidChat); }
  catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ reply: e.message, idea: null }); throw e; }
  // Rate limit por plan: 40/80/150 mensajes/día (Esencial/Pro/Total). Anti-abuso.
  if (!costs.checkRate(uidChat, 'chat', aiLimitsFor(uidChat).chatPerDay).ok) return res.json({ reply: costs.MSG_CHAT_RATE, idea: null });
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
  // Saludo puro ("hola", "qué onda posty"): Posty responde al instante, sin gastar una llamada al modelo.
  {
    const lastUserText = (clean.filter(m => m.role === 'user').pop() || {}).text || '';
    const greetRe = /^(hola+|buenas|buen d[ií]a|buenas tardes|buenas noches|qu[ée] tal|qu[ée] onda|c[óo]mo (va|and[aá]s)|saludos|holis?)[ ,!.…?]*((posty|genio|capo|master|che|querido)[ ,!.…?]*)*$/i;
    if (greetRe.test(lastUserText.trim())) {
      const reply = '¡Hola! 😄 ¿Con qué te ayudo hoy?';
      try {
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uidChat, 'user', lastUserText.slice(0, 2000));
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uidChat, 'assistant', reply);
      } catch (e) {}
      return res.json({ reply, idea: null });
    }
  }
  // Nombre del cliente: "me llamo X" / "llamame X" / respuesta pelada a "¿cómo te llamo?" → se guarda y se usa.
  {
    const lastUserText = (clean.filter(m => m.role === 'user').pop() || {}).text || '';
    const urow = db.prepare('SELECT client_name FROM users WHERE id = ?').get(uidChat) || {};
    if (!((urow.client_name || '').trim())) {
      let cname = null;
      const m1 = lastUserText.match(/(?:me llamo|mi nombre es|llamame|ll\u00E1mame|decime)\s+([a-z\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC]{2,20}(?:\s+[a-z\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC]{2,20})?)/i);
      if (m1) cname = m1[1];
      else {
        try {
          const n = (db.prepare('SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ?').get(uidChat) || {}).c || 0;
          const bare = lastUserText.trim().replace(/[!.\u2026?]+$/, '');
          const common = /^(dale|ok|okay|s[\u00EDi]|no|gracias|bueno|listo|perfecto|genial|jaja+|hola|buenas|promo|posteo|post|reel|historia|semana|idea|precio|plan|prueba|gratis|ayuda|foto|video|instagram|horario|turno|descuento|oferta)$/i;
          if (n <= 2 && /^[a-z\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC]{2,20}(?:\s+[a-z\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC]{2,20})?$/i.test(bare) && !common.test(bare)) cname = bare;
        } catch (e) {}
      }
      if (cname) {
        cname = cname.trim().toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
        db.prepare('UPDATE users SET client_name = ? WHERE id = ?').run(cname, uidChat);
        const reply = `\u00A1Dale, ${cname}! \uD83D\uDE04 Ya me lo anoto.`;
        try {
          db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uidChat, 'user', lastUserText.slice(0, 2000));
          db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uidChat, 'assistant', reply);
        } catch (e) {}
        return res.json({ reply, idea: null });
      }
    }
  }
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
  // Dedup anti-quemado: no reenviar al modelo fotos que ya vio hace poco.
  // Se reenvían solas si pasaron >20h, para que el modelo tenga contexto visual.
  const freshPhotos = (arr) => (Array.isArray(arr) ? arr : [])
    .filter(u => typeof u === 'string' && u.startsWith('data:image/'))
    .filter(u => !costs.photoRecentlySent(uidChat, costs.photoHash(u)));
  const cleanPhotos = freshPhotos(photos).slice(0, 4);
  const cleanLibrary = freshPhotos(library).slice(0, 6);
  // Borradores en revisión: la IA los ve y puede editarlos directo (bloque ```edit)
  // Posty ve TODO: borradores, programados, publicando, fallidos y publicados recientes.
  // Orden: lo que necesita acción primero (borradores), después lo programado,
  // después lo que necesita atención (publicando/fallido), después lo ya publicado.
  let cleanDrafts = [];
  try {
    const rows = db.prepare(`SELECT id, caption, scheduled_for, scheduled_at, status, media_type, needs_review FROM posts
      WHERE user_id = ? AND status IN ('draft','scheduled','publishing','failed','published')
      ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'publishing' THEN 2 WHEN 'failed' THEN 3 ELSE 4 END,
        COALESCE(scheduled_for, created_at) DESC LIMIT 12`).all(uidChat) || [];
    // FM #6/C7: el modelo necesita fecha+HORA local ("AAAA-MM-DD HH:MM"), no solo fecha,
    // y el flag needs_review (si no lo ve, no puede avisar que algo sigue en revisión).
    const chatTz = userTz(uidChat);
    cleanDrafts = rows.map(r => ({
      id: r.id,
      caption: String(r.caption || '').slice(0, 300),
      when: wallInTz(r.scheduled_at || r.scheduled_for, chatTz),
      status: r.status,
      media_type: r.media_type || 'image',
      needs_review: !!r.needs_review,
    }));
  } catch (e) { console.error('[chat] drafts ctx:', e.message); }
  try {
    const settings = getSettings(req.session.userId);
    const uid0 = req.session.userId;
    const perfLine = [performanceBrief(db, uid0), bestHoursLine(db, uid0)].filter(Boolean).join('\n');
    // ADN del negocio: si falta lo esencial, la IA hace la entrevista (needDna).
    // La entrevista solo pregunta lo que falta (dnaMissing), no las 4 de cero.
    let dna = null, needDna = false, dnaMissing = [];
    try {
      const dnarow = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid0);
      if (dnarow && dnarow.dna_json) { try { dna = JSON.parse(dnarow.dna_json); } catch (e) { dna = null; } }
    } catch (e) {}
    dnaMissing = dnaMissingFields(dna);
    needDna = dnaMissing.length > 0;
    // Análisis de su Instagram (si se corrió al conectar). Tope duro anti-quemado.
    let igAnalysis = '';
    try {
      const iar = db.prepare('SELECT summary FROM ig_analysis WHERE user_id = ?').get(uid0);
      if (iar && iar.summary) igAnalysis = String(iar.summary).slice(0, 800);
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
    // Contexto de venta: ¿es trial? ¿venció? ¿qué plan tiene? La IA lo usa para ofrecer el servicio.
    let sales = null;
    let su = null;
    try {
      su = db.prepare('SELECT plan_status, plan, trial_ends_at, trial_extended_until, created_at, client_name, media_asked_at FROM users WHERE id = ?').get(req.session.userId);
      if (su) {
        const tEnds = trialEffectiveEnd(su);
        const nowMs = Date.now();
        // Cupo REAL de la semana (de la DB): Posty tiene que saberlo a la perfección.
        // En su propio try: si falla, el resto del contexto igual llega.
        let quota = null;
        try { quota = weeklyQuota(req.session.userId); } catch (e) { console.error('[chat] quota ctx:', e.message); }
        // Próximos posteos programados: Posty los conoce y los menciona cuando pinta.
        let upcoming = [];
        try {
          upcoming = db.prepare(`SELECT caption, source_topic, media_type, scheduled_at FROM posts
            WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL
            AND datetime(scheduled_at) > datetime('now', '-4 hours')
            ORDER BY datetime(scheduled_at) LIMIT 3`).all(req.session.userId).map(r => ({
            when: String(r.scheduled_at || '').slice(0, 16).replace('T', ' '),
            type: r.media_type === 'video' ? 'reel' : r.media_type === 'story' ? 'historia' : r.media_type === 'carousel' ? 'carrusel' : 'posteo',
            caption: String(r.caption || r.source_topic || 'Posteo').split('\n')[0].slice(0, 80),
          }));
        } catch (e) { console.error('[chat] upcoming ctx:', e.message); }
        sales = {
          isTrial: su.plan_status !== 'active',
          trialExpired: su.plan_status === 'trial' && tEnds > 0 && tEnds <= nowMs,
          trialDaysLeft: (su.plan_status === 'trial' && tEnds > nowMs) ? Math.ceil((tEnds - nowMs) / 86400000) : 0,
          planName: su.plan_status === 'active' ? (su.plan || '') : '',
          quota,
          upcoming,
        };
      }
    } catch (e) {}
    // Pedido de fotos/video: como máximo 1 vez por semana, y solo si el cliente
    // no mandó fotos ni videos en los últimos 7 días.
    let needMediaAsk = false;
    try {
      const lastAsk = (su && su.media_asked_at) || 0;
      let freshCount = 0;
      try {
        const r = db.prepare("SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND created_at > datetime('now', '-7 days')").get(uid0);
        freshCount = (r && r.c) || 0;
      } catch (e) {}
      needMediaAsk = lastAsk < Date.now() - 7 * 24 * 3600 * 1000 && freshCount === 0;
    } catch (e) {}
    const out = await chatIdea(
      // Niveles que se sienten: el nivel cambia REALMENTE el payload del chat.
      levelBoosted(uid0, 'chat', { messages: clean, profile: getProfile(req.session.userId), taste: tasteProfile(req.session.userId) + inspoLine, photos: cleanPhotos, library: cleanLibrary, drafts: cleanDrafts, performance: perfLine, dna, needDna, dnaMissing, igAnalysis, frustrated, styleRules, voice, golden: goldenExamples(req.session.userId), note: chatNote, tz: userTz(uid0), sales, outcome: outcomeBrief(uid0), userId: uid0, clientName: (su && su.client_name) || '', needMediaAsk, captionExtras: captionExtrasFor(uid0) }),
      settings.openai_key || process.env.OPENAI_API_KEY || ''
    );
    const uid = req.session.userId;
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'user', clean[clean.length - 1].text);
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', String(out.reply || '').slice(0, 2000));
    if (out.idea) {
      db.prepare('INSERT INTO chat_state (user_id, idea_json, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET idea_json=excluded.idea_json, updated_at=excluded.updated_at').run(uid, JSON.stringify(out.idea), Date.now());
      // Pedido de fotos/video (1 vez por semana): registrar cuándo se pidió
      try {
        if (out.reply && /si me mand[aá]s|mandame|mandáme|📷/i.test(String(out.reply))) {
          db.prepare('UPDATE users SET media_asked_at = ? WHERE id = ?').run(Date.now(), uid);
        }
      } catch (e) {}
    }
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
    let editPhotoFailed = false;
    if (Array.isArray(out.edits) && out.edits.length) {
      // Palanca 7: si el pedido cambia el CONCEPTO (no solo el texto), la imagen se
      // regenera vía concept-shot para acompañar. Solo se salta si el usuario pidió
      // cambio explícito de texto ("cambiá el caption", "cambiá el texto").
      const lastUserMsg = (clean.filter(m => m.role === 'user').pop() || {}).text || '';
      // C5/FM #2: cambios quirúrgicos de texto (título, emojis, acortar, sacar algo)
      // NO regeneran la imagen — solo los cambios de concepto la regeneran.
      const textOnlyEdit = /cambi[aá]\s+(el\s+)?(caption|texto|copy|palabras|t[ií]tulo)|cambiame\s+(el\s+)?(texto|caption|t[ií]tulo)|solo\s+(el\s+)?texto|m[aá]s\s+corto|acort[aá]|s[aá]cale|sac[aá]les?|quit[aá](le|les)?|emojis?/i.test(lastUserMsg);
      let n = 0, imgRegen = 0;
      const editedIds = [];
      const regenJobs = [];
      for (const ed of out.edits) {
        if (!(ed.draft >= 1 && ed.draft <= cleanDrafts.length)) continue;
        if (ed.caption === undefined && ed.hashtags === undefined && ed.photo_index === undefined && ed.when === undefined) continue;
        const target = cleanDrafts[ed.draft - 1];
        const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(target.id, uid);
        if (!post || (post.status !== 'draft' && post.status !== 'scheduled')) continue;
        // Historial de versiones: si este edit cambia algo, guardar la anterior
        // para que el cliente pueda "volver atrás" ("el anterior estaba mejor").
        if (ed.caption !== undefined || ed.hashtags !== undefined || Number.isInteger(ed.photo_index)) {
          try {
            db.prepare(`INSERT INTO post_versions (post_id, caption, hashtags, image_path) VALUES (?,?,?,?)`)
              .run(post.id, String(post.caption || ''), String(post.hashtags || ''), String(post.image_path || ''));
          } catch (e) { console.error('[chat-edit] version save:', e.message); }
        }
        const newCaption = ed.caption !== undefined ? ed.caption : post.caption;
        const captionChanged = ed.caption !== undefined && String(ed.caption).trim() !== String(post.caption || '').trim();
        db.prepare('UPDATE posts SET caption = ?, hashtags = ? WHERE id = ?').run(
          newCaption,
          ed.hashtags !== undefined ? ed.hashtags : post.hashtags,
          post.id
        );
        // Cambio de foto: el índice refiere a sus fotos guardadas (0 = la más nueva)
        let pickedOwnPhoto = false;
        let photoFailed = false;
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
            if (own) { db.prepare(`UPDATE posts SET image_path = ? WHERE id = ?`).run(String(newPath), post.id); pickedOwnPhoto = true; }
            else photoFailed = true;
          } else photoFailed = true;
          if (photoFailed) editPhotoFailed = true;
        }
        // Palanca 7: cambió el concepto → regenerar la imagen para que acompañe.
        // (Si el usuario eligió su propia foto, o pidió solo texto, se respeta.)
        // FM #2: las regens NO van secuenciales dentro del loop — se juntan los
        // trabajos y corren en paralelo después, para no multiplicar la latencia por N.
        if (captionChanged && !textOnlyEdit && !pickedOwnPhoto) {
          const capForImg = String(newCaption);
          const tipoForImg = post.tipo || '';
          regenJobs.push((async () => {
            try {
              const headline = makeHeadline(capForImg.split('\n')[0], 6) || makeHeadline(capForImg, 5);
              const newPath = await conceptShotGenerateQueued({ uid, idea: capForImg, tipo: tipoForImg, headline, refs: [] });
              if (newPath) {
                db.prepare('UPDATE posts SET image_path = ? WHERE id = ?').run(String(newPath), post.id);
                return true;
              }
            } catch (e) {
              // Si falla (incluido kill-switch), se mantiene la imagen vieja: nunca se rompe el flujo.
              console.error('[chat-edit] regen imagen:', e.message);
            }
            return false;
          })());
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
        editedIds.push(post.id);
      }
      // FM #2: correr las regeneraciones en paralelo (no secuencial puro) —
      // N borradores ya no multiplican la latencia del turno por N.
      if (regenJobs.length) {
        const done = await Promise.all(regenJobs);
        imgRegen = done.filter(Boolean).length;
      }
      if (n) {
        // Devolver las imágenes de los borradores editados para mostrarlas en el chat.
        let imgs = [];
        try {
          imgs = editedIds.map(id => {
            const p = db.prepare('SELECT image_path FROM posts WHERE id = ?').get(id);
            return p ? absImageUrl(uid, p.image_path) : '';
          }).filter(Boolean);
        } catch (e) {}
        editApplied = { ok: true, count: n, imageRegen: imgRegen, images: imgs, photoFailed: editPhotoFailed || undefined };
      }
    }
    // Publicación inmediata pedida en el chat: "publicalo ya" / "dale, subilo" ES la
    // aprobación explícita. Mismos resguardos que publish-now (revisión, cupo, estado).
    let publishApplied = null;
    if (Array.isArray(out.publishes) && out.publishes.length) {
      const pub = { ok: [], inReview: [], failed: [] };
      for (const pb of out.publishes) {
        if (!(pb.draft >= 1 && pb.draft <= cleanDrafts.length)) continue;
        const target = cleanDrafts[pb.draft - 1];
        const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(target.id, uid);
        if (!post) { continue; }
        if (post.status === 'publishing' || post.status === 'published') { pub.ok.push(target.id); continue; }
        if (!['draft', 'scheduled', 'failed'].includes(post.status)) { pub.failed.push(target.id); continue; }
        if (post.needs_review) { pub.inReview.push(target.id); continue; }
        if (!['scheduled', 'publishing', 'published'].includes(post.status)) {
          const q = quotaFor(uid, post.media_type);
          if (q.left <= 0) { pub.failed.push(target.id); continue; }
        }
        db.prepare(`UPDATE posts SET status='publishing', scheduled_at=datetime('now'), error='' WHERE id=?`).run(post.id);
        try { ensureImageBaseUrl(db, uid, req); } catch (e) {}
        publishSinglePost(db, { ...post, status: 'publishing' }).catch((e) => console.error('[chat-publish]:', e.message));
        try { recordSignal(uid, post, 'approved'); } catch (e) {}
        pub.ok.push(target.id);
      }
      if (pub.ok.length || pub.inReview.length || pub.failed.length) publishApplied = pub;
    }
    // Volver a la versión anterior de un borrador ("el anterior estaba mejor").
    // Restaura la última guardada y la consume: otro "volvé" retrocede una más.
    let revertApplied = null;
    if (Array.isArray(out.reverts) && out.reverts.length) {
      let n = 0;
      for (const rv of out.reverts) {
        if (!(rv.draft >= 1 && rv.draft <= cleanDrafts.length)) continue;
        const target = cleanDrafts[rv.draft - 1];
        const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(target.id, uid);
        if (!post || (post.status !== 'draft' && post.status !== 'scheduled')) continue;
        const prev = db.prepare(`SELECT * FROM post_versions WHERE post_id = ? ORDER BY id DESC LIMIT 1`).get(post.id);
        if (!prev) continue;
        db.prepare(`UPDATE posts SET caption = ?, hashtags = ?, image_path = ? WHERE id = ?`)
          .run(prev.caption, prev.hashtags, prev.image_path, post.id);
        db.prepare(`DELETE FROM post_versions WHERE id = ?`).run(prev.id);
        try { recordSignal(uid, post, 'rejected'); } catch (e) {}
        n++;
      }
      if (n) revertApplied = { ok: true, count: n };
    }
    // MODO OPCIONES: las ideas se devuelven como TEXTO. La imagen se genera
    // una sola vez cuando el usuario crea el posteo (draftFromIdea).
    // (2026-10-02: eliminado el bloque que generaba 3 imágenes acá — tardaba
    // 630s, el frontend cortaba a los 60s, y se quemaba costo en imágenes huérfanas.)
    // El cliente pidió VER sus posteos (```show_drafts): devolver los borradores
    // reales con imagen para que el chat los muestre. Nunca texto sin imágenes.
    let showDrafts = null;
    if (out.showDrafts) {
      try {
        const rows = db.prepare(`SELECT id, caption, image_path, media_type, scheduled_for, status
          FROM posts WHERE user_id = ? AND status IN ('draft','scheduled')
          ORDER BY COALESCE(scheduled_for, created_at) ASC LIMIT 10`).all(uid) || [];
        showDrafts = rows.map(r => ({
          id: r.id,
          caption: String(r.caption || '').slice(0, 200),
          image_url: r.image_path ? absImageUrl(uid, r.image_path) : null,
          media_type: r.media_type || 'image',
          when: r.scheduled_for || null,
          status: r.status,
        })).filter(d => d.image_url);
      } catch (e) { console.error('[chat] show_drafts:', e.message); }
      // Si pidió mostrar pero no hay nada con imagen: no prometer imágenes.
      if (!showDrafts || !showDrafts.length) {
        showDrafts = [];
        out.reply = 'Todavía no armé nada — ¿la armamos? 🚀';
      }
    }
    // FM #5: si el publish quedó en revisión o falló, el festejo del modelo
    // ("¡ya está saliendo!") no puede quedar: se corrige el reply acá,
    // después de procesar los bloques y antes de responder.
    out.reply = fixPublishReply(out.reply, publishApplied);
    // Pre-generar la imagen AHORA en background: cuando el cliente abra la
    // tarjeta "IDEA LISTA", ya va a estar lista en vez de hacerlo esperar.
    // REACTIVADA (2026-10-04): la generación on-demand sincrónica falla por
    // timeout del proxy (respuesta vacía → "Detalle: Error"). La cola por
    // usuario (GEN_QUEUE) ya evita los 429s, y el preview reutiliza la imagen
    // (draftFromPreview) así que no hay doble gasto.
    if (out.idea && (out.idea.titulo || out.idea.title)) pregenIdeaImage(uidChat, out.idea);
    res.json({ reply: out.reply, idea: out.idea || null, ideas: out.ideas || null, edit: editApplied, publish: publishApplied, revert: revertApplied, dna: dnaSaved, options: out.options || null, showDrafts });
  } catch (e) {
    console.error('[chat]', e.message);
    res.status(500).json({ error: 'Uh, me trabé un segundo 😅 Dame otro intento que esta sale' });
  }
});

// Cupo semanal por plan: posteos de feed vs postsPerWeek, reels vs reelsPerWeek,
// historias vs storiesPerWeek. Cada formato consume SU cupo; sin pools compartidos.
// weeklyQuota(uid) = cupo de FEED (compatibilidad con el frontend).
// quotaFor(uid, mediaType) = cupo para 'image' | 'video' | 'carousel' | 'story'.
function quotaCounts(userId, monday) {
  // El cupo cuenta lo COMPROMETIDO para la semana: posteos programados / en publicación /
  // publicados cuya fecha de salida cae en ESTA semana (por scheduled_at, igual que el Schedule).
  // Contar por created_at desfasaba la tira del chat vs el calendario.
  const rows = db.prepare(`SELECT media_type, COUNT(*) AS n FROM posts
    WHERE user_id = ? AND status IN ('scheduled','publishing','published')
    AND date(COALESCE(scheduled_at, published_at, created_at)) >= date(?)
    AND date(COALESCE(scheduled_at, published_at, created_at)) < date(?, '+7 days')
    GROUP BY media_type`).all(userId, monday, monday) || [];
  const m = {};
  for (const r of rows) m[r.media_type || 'image'] = r.n;
  return m;
}
function quotaFor(userId, mediaType) {
  const user = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(userId) || {};
  const plan = getPlan(user.plan_status === 'active' ? user.plan : TRIAL_PLAN);
  const st = getSettings(userId) || {};
  const tz = st.timezone || 'America/Argentina/Buenos_Aires';
  const monday = streaks.mondayKeyOf(streaks.tzToday(tz));
  const counts = quotaCounts(userId, monday);
  const mt = mediaType === 'video' ? 'video' : mediaType === 'story' ? 'story' : mediaType === 'carousel' ? 'carousel' : 'image';
  // Cupo PROPIO por formato (matriz de config/plans.js). Si el plan no incluye el
  // formato (límite 0), queda bloqueado: left = 0. Sin pools compartidos.
  // Esencial: 5/0/0 · Pro: 7/0/3 · Total: 7/5/7 (posteos/reels/historias).
  let limit, used;
  if (mt === 'video') {
    limit = plan.reelsPerWeek || 0;
    used = counts.video || 0;
  } else if (mt === 'story') {
    limit = plan.storiesPerWeek || 0;
    used = counts.story || 0;
  } else {
    limit = plan.postsPerWeek || 3;
    used = (counts.image || 0) + (counts.carousel || 0);
  }
  return { limit, used, left: Math.max(0, limit - used), plan: plan.id, plan_name: plan.name };
}
// Nombre del formato para mensajes de cupo
function quotaUnitName(mt) {
  return mt === 'video' ? 'reels' : mt === 'story' ? 'historias' : 'posteos';
}
function weeklyQuota(userId) {
  // El cupo "principal" es el de feed; se agregan reels e historias con su cupo propio.
  const q = quotaFor(userId, 'image');
  const qr = quotaFor(userId, 'video');
  const qs = quotaFor(userId, 'story');
  return { ...q, reels: { limit: qr.limit, used: qr.used, left: qr.left }, stories: { limit: qs.limit, used: qs.used, left: qs.left } };
}
app.get('/api/quota', requireAuth, (req, res) => res.json(weeklyQuota(req.session.userId)));
// El frontend avisa hitos que solo él conoce (ej: semana aceptada).
app.post('/api/funnel', requireAuth, (req, res) => {
  const { event } = req.body || {};
  if (!/^[a-z_]{3,30}$/.test(event || '')) return res.status(400).json({ error: 'evento inválido' });
  track(req.session.userId, 'client_' + event);
  res.json({ ok: true });
});

// Analytics propio: el frontend manda eventos en batch (pantallas + acciones).
// Sin auth estricta (los anónimos de /prueba también cuentan); el user_id se ata
// por sesión si hay login. Rate-limit básico por IP para que nadie lo abuse.
const TRACK_RL = new Map();
setInterval(() => { // limpieza cada 5 min
  const now = Date.now();
  for (const [k, v] of TRACK_RL) if (now - v.t > 300000) TRACK_RL.delete(k);
}, 300000).unref();
// Garantía de cupo: un posteo trabado en 'publishing' (+60 min) se marca como fallido
// para liberar el cupo. Nunca se le puede cobrar cupo al usuario por algo que no salió.
setInterval(() => {
  try {
    const r = db.prepare(`UPDATE posts SET status='failed', error='Se trabó publicando — no salió a Instagram, el cupo se liberó.'
      WHERE status='publishing' AND scheduled_at IS NOT NULL AND datetime(scheduled_at) < datetime('now', '-60 minutes')`).run();
    if (r.changes) console.log(`[quota-guard] ${r.changes} posteo(s) trabados liberados`);
  } catch (e) { console.error('[quota-guard]:', e.message); }
}, 300000).unref();
app.post('/api/track', (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || '';
    const now = Date.now();
    let rl = TRACK_RL.get(ip);
    if (!rl || now - rl.t > 60000) rl = { t: now, n: 0 };
    rl.n++;
    TRACK_RL.set(ip, rl);
    if (rl.n > 40) return res.status(429).json({ ok: false });
    const evs = req.body && Array.isArray(req.body.events) ? req.body.events : [];
    const uid = req.session && req.session.userId ? req.session.userId : null;
    let n = 0;
    for (const e of evs.slice(0, 60)) {
      const name = String((e && e.name) || '');
      if (!/^[a-z0-9_]{2,40}$/.test(name)) continue;
      const sid = String((e && e.sid) || '').slice(0, 32);
      evTrack(uid, name, (e && e.props) || {}, sid);
      n++;
    }
    res.json({ ok: true, n });
  } catch (e) { res.json({ ok: true, n: 0 }); }
});

// Panel de analytics (solo Valentino): ?token=ADMIN_TOKEN. Sin PII, solo conteos.
// Funnel /prueba → pago con % de conversión por paso. Lee la tabla nueva `events`
// y suma la tabla vieja `funnel_events` para no perder el historial.
const FUNNEL_STEPS = [
  { key: 'prueba_view', label: 'Visitaron la prueba' },
  { key: 'prueba_complete', label: 'Completaron el formulario' },
  { key: 'prueba_register', label: 'Crearon cuenta' },
  { key: 'ig_connect', label: 'Conectaron Instagram' },
  { key: 'week_generate_done', label: 'Semana generada' },
  { key: 'post_publish', label: 'Publicaron algo' },
  { key: 'payment_ok', label: 'Pagaron' },
];
// Mapeo de la tabla vieja a nombres nuevos (historial)
const LEGACY_FUNNEL_MAP = {
  prueba_done: 'prueba_complete', registered: 'prueba_register',
  client_week_accepted: 'schedule_all', first_published: 'post_publish',
  subscribed: 'payment_ok', ig_connected: 'ig_connect',
};
const requireAdminToken = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN || '';
  if (!token || req.query.token !== token) return res.status(403).json({ error: 'no autorizado' });
  next();
};
function funnelUniquesPrev(name, days) {
  // Período anterior equivalente: [2*days, days] — para tendencias.
  const ids = new Set();
  try {
    const rows = db.prepare(`SELECT user_id, session_id FROM events
      WHERE name = ? AND datetime(created_at) >= datetime('now', ?) AND datetime(created_at) < datetime('now', ?)`)
      .all(name, `-${days * 2} days`, `-${days} days`);
    for (const r of rows) ids.add(r.user_id ? 'u:' + r.user_id : 's:' + (r.session_id || '?'));
  } catch (e) {}
  return ids;
}
function funnelUniques(name, days) {
  // Usuarios únicos por paso: user_id si hay login, si no la sesión anónima.
  const ids = new Set();
  try {
    const rows = db.prepare(`SELECT user_id, session_id FROM events
      WHERE name = ? AND datetime(created_at) >= datetime('now', ?)`).all(name, `-${days} days`);
    for (const r of rows) ids.add(r.user_id ? 'u:' + r.user_id : 's:' + (r.session_id || '?'));
  } catch (e) {}
  return ids;
}
app.get('/api/admin/funnel', requireAdminToken, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const totals = {};
  const perStep = FUNNEL_STEPS.map(s => ({ ...s, ids: funnelUniques(s.key, days) }));
  // Historial viejo: se suma a los pasos que correspondan
  try {
    for (const [legacy, mapped] of Object.entries(LEGACY_FUNNEL_MAP)) {
      const rows = db.prepare(`SELECT user_id FROM funnel_events
        WHERE event = ? AND datetime(created_at) >= datetime('now', ?)`).all(legacy, `-${days} days`);
      const st = perStep.find(s => s.key === mapped);
      if (st) for (const r of rows) st.ids.add(r.user_id ? 'u:' + r.user_id : 's:?');
    }
  } catch (e) {}
  for (const s of perStep) totals[s.key] = s.ids.size;
  const funnel = [];
  let prev = 0, first = 0;
  perStep.forEach((s, i) => {
    const users = s.ids.size;
    if (i === 0) first = users;
    funnel.push({ key: s.key, label: s.label, users,
      pct_prev: prev ? Math.round(users / prev * 1000) / 10 : (i === 0 ? 100 : 0),
      pct_first: first ? Math.round(users / first * 1000) / 10 : 0 });
    prev = users;
  });
  let byDay = [];
  try {
    byDay = db.prepare(`SELECT date(created_at) AS d, name, COUNT(*) AS n FROM events
      WHERE datetime(created_at) >= datetime('now', ?) GROUP BY d, name ORDER BY d DESC LIMIT 600`).all(`-${days} days`);
  } catch (e) {}
  // Meta 200 suscriptores: suscriptores pagos, MRR y conversión trial→pago.
  let goal = { target: 200, subscribers: 0, mrr: 0, trial_to_paid: 0, new_30d: 0 };
  try {
    const actives = db.prepare(`SELECT plan, mp_base_amount FROM users WHERE plan_status = 'active'`).all();
    let mrr = 0;
    for (const u of actives) {
      const base = Number(u.mp_base_amount) || 0;
      if (base > 0) { mrr += base; continue; }
      const pl = (PLANS && PLANS[u.plan]) || null;
      if (pl && pl.price) mrr += Number(pl.price) || 0;
    }
    const regs = (totals['prueba_register'] || 0), paid = (totals['payment_ok'] || 0);
    const newRows = db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM events
      WHERE name = 'payment_ok' AND user_id IS NOT NULL AND datetime(created_at) >= datetime('now', '-30 days')`).get();
    goal = { target: 200, subscribers: actives.length, mrr: Math.round(mrr),
      trial_to_paid: regs ? Math.round(paid / regs * 1000) / 10 : 0,
      new_30d: newRows ? newRows.n : 0 };
  } catch (e) {}
  // Tendencias: cada paso vs el período anterior equivalente
  const trends = {};
  try {
    for (const s of perStep) {
      const cur = s.ids.size, prev = funnelUniquesPrev(s.key, days).size;
      trends[s.key] = { cur, prev,
        delta: prev ? Math.round((cur - prev) / prev * 1000) / 10 : (cur ? 100 : 0) };
    }
  } catch (e) {}
  // Time-to-value: horas desde registro hasta primer posteo publicado (90 días)
  let ttv = { n: 0, avg_h: 0, med_h: 0, d1_pct: 0 };
  try {
    const rows = db.prepare(`SELECT (julianday(p.first_pub) - julianday(u.created_at)) * 24 AS h
      FROM users u JOIN (
        SELECT user_id, MIN(published_at) AS first_pub FROM posts
        WHERE status = 'published' AND published_at IS NOT NULL GROUP BY user_id
      ) p ON p.user_id = u.id
      WHERE datetime(u.created_at) >= datetime('now', '-90 days')`).all();
    const hs = rows.map(r => Number(r.h)).filter(h => h >= 0 && h < 24 * 60).sort((a, b) => a - b);
    if (hs.length) {
      const avg = hs.reduce((s, h) => s + h, 0) / hs.length;
      ttv = { n: hs.length, avg_h: Math.round(avg * 10) / 10, med_h: Math.round(hs[Math.floor(hs.length / 2)] * 10) / 10,
        d1_pct: Math.round(hs.filter(h => h <= 24).length / hs.length * 1000) / 10 };
    }
  } catch (e) {}
  res.json({ days, totals, funnel, by_day: byDay, goal, trends, ttv, admin_token_set: true });
});

// Actividad: eventos por día + usuarios activos por día (login o sesión anónima)
app.get('/api/admin/activity', requireAdminToken, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  let byDay = [], dau = [], totals = {};
  try {
    byDay = db.prepare(`SELECT date(created_at) AS d, COUNT(*) AS n FROM events
      WHERE datetime(created_at) >= datetime('now', ?) GROUP BY d ORDER BY d DESC`).all(`-${days} days`);
    dau = db.prepare(`SELECT date(created_at) AS d,
        COUNT(DISTINCT COALESCE('u:' || user_id, 's:' || session_id)) AS n FROM events
      WHERE datetime(created_at) >= datetime('now', ?) GROUP BY d ORDER BY d DESC`).all(`-${days} days`);
    const rows = db.prepare(`SELECT name, COUNT(*) AS n FROM events
      WHERE datetime(created_at) >= datetime('now', ?) GROUP BY name ORDER BY n DESC LIMIT 60`).all(`-${days} days`);
    for (const r of rows) totals[r.name] = r.n;
  } catch (e) {}
  res.json({ ok: true, days, by_day: byDay, dau, totals });
});

// Gasto de IA por función (anti-quemado). ?token=ADMIN_TOKEN&days=1
// Muestra el breakdown que responde "quién quema": feature × modelo,
// con llamadas, tokens y USD estimados. El gasto de hoy alimenta el kill-switch.
app.get('/api/admin/ai-costs', requireAdminToken, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 1, 1), 90);
  res.json({
    ok: true, days,
    daily_cap_usd: costs.DAILY_CAP_USD,
    today_spend_usd: Math.round(costs.daySpendUsd() * 10000) / 10000,
    breakdown: costs.costBreakdown(days),
  });
});

// Extender mi propia prueba (2026-10-03): para el fundador/testing.
// Solo el usuario logueado. Si ya tiene una extensión VIGENTE, no deja.
// Si venció o nunca tuvo, extiende 30 días.
app.get('/api/me/extend-trial', requireAuth, (req, res) => {
  try {
    const u = db.prepare('SELECT trial_extended_until FROM users WHERE id = ?').get(req.session.userId);
    const ext = (u && u.trial_extended_until) || 0;
    if (ext > Date.now()) {
      return res.json({ ok: false, error: 'Ya tenés una extensión vigente hasta ' + new Date(ext).toISOString().slice(0, 10) });
    }
    const until = Date.now() + 30 * 86400000;
    db.prepare(`UPDATE users SET trial_extended_until = ? WHERE id = ?`).run(until, req.session.userId);
    console.log(`[trial] usuario ${req.session.userId} extendió su prueba 30 días`);
    res.json({ ok: true, extended_until: new Date(until).toISOString().slice(0, 10) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Eventos recientes (para el timeline por usuario). Filtros: user_id, email, name, days, limit.
app.get('/api/admin/events', requireAdminToken, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const name = String(req.query.name || '').slice(0, 40);
  const email = String(req.query.email || '').trim().toLowerCase();
  const userId = Number(req.query.user_id) || 0;
  let rows = [];
  try {
    if (userId || email) {
      let uid = userId;
      if (!uid && email) {
        const u = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
        uid = u ? u.id : -1;
      }
      rows = db.prepare(`SELECT e.*, u.email FROM events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.user_id = ? ${name ? 'AND e.name = ?' : ''} AND datetime(e.created_at) >= datetime('now', ?)
        ORDER BY e.id DESC LIMIT ?`).all(...(name ? [uid, name, `-${days} days`, limit] : [uid, `-${days} days`, limit]));
    } else {
      rows = db.prepare(`SELECT e.*, u.email FROM events e LEFT JOIN users u ON u.id = e.user_id
        WHERE ${name ? 'e.name = ? AND ' : ''}datetime(e.created_at) >= datetime('now', ?)
        ORDER BY e.id DESC LIMIT ?`).all(...(name ? [name, `-${days} days`, limit] : [`-${days} days`, limit]));
    }
  } catch (e) {}
  res.json({ ok: true, events: rows.map(r => ({ id: r.id, user_id: r.user_id, email: r.email || null,
    session_id: r.session_id, name: r.name, props: r.props, created_at: r.created_at })) });
});

// Admin: registrar gasto en ads (para CAC)
app.post('/api/admin/ad-spend', requireAdminToken, (req, res) => {
  const { date, campaign, amount_usd } = req.body || {};
  const amt = Number(amount_usd);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amt > 0))
    return res.status(400).json({ error: 'Fecha (AAAA-MM-DD) y monto mayor a 0.' });
  try {
    db.prepare('INSERT INTO ad_spend (date, campaign, amount_usd) VALUES (?, ?, ?)')
      .run(date, String(campaign || '').slice(0, 80), amt);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'No se pudo guardar.' }); }
});
// Descargar planilla CSV con toda la actividad de los clientes (para Excel/Sheets)
app.get('/api/admin/export', requireAdminToken, (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  let rows = [];
  try {
    rows = db.prepare(`SELECT e.created_at, u.email, e.name, e.props FROM events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE datetime(e.created_at) >= datetime('now', ?)
      ORDER BY e.id DESC LIMIT 20000`).all(`-${days} days`);
  } catch (e) {}
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['fecha,email,evento,detalle'];
  for (const r of rows) {
    let det = '';
    try {
      const o = JSON.parse(r.props || '{}');
      det = Object.entries(o).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(' | ');
    } catch (e) { det = String(r.props || '').slice(0, 200); }
    lines.push([r.created_at, r.email || '(anonimo)', r.name, det].map(q).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="posta-actividad-${days}d.csv"`);
  res.send('﻿' + lines.join('\n'));
});

// Crecimiento: plata (MRR vs costo IA), referidos, rendimiento de contenido,
// motivos de cancelación y temas del chat. Todo lo que mueve decisiones.
app.get('/api/admin/growth', requireAdminToken, (req, res) => {
  const out = { money: {}, referrals: {}, content: {}, cancel_reasons: [], chat_themes: [] };
  try {
    // Plata
    const actives = db.prepare(`SELECT plan, mp_base_amount FROM users WHERE plan_status = 'active'`).all();
    let mrr = 0;
    for (const u of actives) {
      const base = Number(u.mp_base_amount) || 0;
      if (base > 0) { mrr += base; continue; }
      const pl = (PLANS && PLANS[u.plan]) || null;
      if (pl && pl.price) mrr += Number(pl.price) || 0;
    }
    let ai30 = 0;
    try { ai30 = costs.costBreakdown(30).reduce((s, r) => s + (Number(r.usd) || 0), 0); } catch (e) {}
    out.money = { mrr: Math.round(mrr), subscribers: actives.length,
      ai_today_usd: Math.round(costs.daySpendUsd() * 100) / 100,
      ai_30d_usd: Math.round(ai30 * 100) / 100,
      cost_per_user_usd: actives.length ? Math.round(ai30 / actives.length * 100) / 100 : 0 };
    // Referidos
    const rTot = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by IS NOT NULL`).get();
    const rPay = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by IS NOT NULL AND plan_status = 'active'`).get();
    const top = db.prepare(`SELECT u2.email AS email, u2.referral_code AS code, COUNT(*) AS n FROM users u
      JOIN users u2 ON u2.id = u.referred_by GROUP BY u.referred_by ORDER BY n DESC LIMIT 8`).all();
    out.referrals = { signups: rTot ? rTot.n : 0, paying: rPay ? rPay.n : 0,
      top: (top || []).map(t => ({ email: t.email, code: (t.code || '').toLowerCase(), n: t.n })) };
    // Contenido: rendimiento real en Instagram (30 días)
    const cm = db.prepare(`SELECT COUNT(*) AS n, AVG(pm.reach) AS reach, AVG(pm.likes) AS likes,
        AVG(pm.comments) AS comments FROM post_metrics pm
        JOIN posts p ON p.id = pm.post_id
        WHERE p.status = 'published' AND datetime(p.published_at) >= datetime('now', '-30 days')`).get();
    const pubs = db.prepare(`SELECT COUNT(*) AS n FROM posts
      WHERE status = 'published' AND datetime(published_at) >= datetime('now', '-30 days')`).get();
    out.content = { published_30d: pubs ? pubs.n : 0,
      avg_reach: Math.round((cm && cm.reach) || 0), avg_likes: Math.round(((cm && cm.likes) || 0) * 10) / 10,
      avg_comments: Math.round(((cm && cm.comments) || 0) * 10) / 10 };
    // Motivos de cancelación
    const cr = db.prepare(`SELECT cancel_reason AS reason, COUNT(*) AS n FROM users
      WHERE plan_status = 'cancelled' AND cancel_reason != '' AND cancel_reason IS NOT NULL
      GROUP BY cancel_reason ORDER BY n DESC LIMIT 10`).all();
    out.cancel_reasons = (cr || []).map(x => ({ reason: x.reason, n: x.n }));
    // Temas del chat (últimos 30 días, mensajes del usuario)
    const msgs = db.prepare(`SELECT text FROM chat_messages WHERE role = 'user'
      AND datetime(created_at) >= datetime('now', '-30 days') LIMIT 2000`).all();
    const stop = new Set(('de,la,el,que,en,y,a,los,las,un,una,por,con,se,no,me,mi,para,es,son,del,al,como,mas,pero,sus,le,lo,su,este,esta,estos,estas,ese,esa,quiero,quieres,hola,gracias,porque,tengo,tiene,tienen,hacer,hace,hacen,puedo,puede,puedes,ser,estoy,esta,estan,esto,esto,muy,tan,solo,sí,si,ni,también,donde,cuando,hay,vez,veces,cosa,cosas,algo,algo,nada,todo,todos,toda,todas,posty').split(','));
    const freq = {};
    for (const m of (msgs || [])) {
      const words = String(m.text || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .match(/[a-z]{4,}/g) || [];
      for (const w of words) { if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1; }
    }
    out.chat_themes = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([word, n]) => ({ word, n }));
    // Cohorts: por semana de registro, cuántos siguen activos
    try {
      const ch = db.prepare(`SELECT strftime('%Y-%W', created_at) AS week, COUNT(*) AS total,
          SUM(CASE WHEN plan_status = 'active' THEN 1 ELSE 0 END) AS active
        FROM users GROUP BY week ORDER BY week DESC LIMIT 12`).all();
      out.cohorts = (ch || []).map(c => ({ week: c.week, total: c.total, active: c.active || 0,
        pct: c.total ? Math.round(c.active / c.total * 1000) / 10 : 0 }));
    } catch (e) { out.cohorts = []; }
    // Taste: templates con más rechazo (señal directa de dónde Posty está flojo)
    try {
      const ts = db.prepare(`SELECT COALESCE(NULLIF(template,''), '(sin template)') AS template,
          SUM(CASE WHEN client_signal = 'approved' THEN 1 ELSE 0 END) AS ok,
          SUM(CASE WHEN client_signal = 'rejected' THEN 1 ELSE 0 END) AS no,
          COUNT(*) AS n FROM post_signals
        WHERE datetime(created_at) >= datetime('now', '-90 days')
        GROUP BY template HAVING n >= 3 ORDER BY no DESC LIMIT 12`).all();
      out.taste = (ts || []).map(t => ({ template: t.template, ok: t.ok || 0, no: t.no || 0,
        reject_pct: (t.ok + t.no) ? Math.round(t.no / (t.ok + t.no) * 1000) / 10 : 0 }));
    } catch (e) { out.taste = []; }
    // 🩺 Salud del sistema: fallos silenciosos que nadie ve
    try {
      const genStart = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE name = 'week_generate_start' AND datetime(created_at) >= datetime('now', '-30 days')`).get().c;
      const genDone = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE name = 'week_generate_done' AND datetime(created_at) >= datetime('now', '-30 days')`).get().c;
      const failedPosts = db.prepare(`SELECT p.id, u.email, p.error, p.created_at FROM posts p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = 'failed' AND datetime(p.created_at) >= datetime('now', '-30 days') ORDER BY p.created_at DESC LIMIT 10`).all();
      const stuck = db.prepare(`SELECT p.id, u.email, p.scheduled_at FROM posts p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.status = 'publishing' AND p.scheduled_at IS NOT NULL AND datetime(p.scheduled_at) < datetime('now', '-60 minutes') ORDER BY p.scheduled_at DESC LIMIT 10`).all();
      out.health = {
        gen_start_30d: genStart, gen_done_30d: genDone,
        gen_rate: genStart ? Math.round(genDone / genStart * 1000) / 10 : 100,
        failed_posts_30d: db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE status = 'failed' AND datetime(created_at) >= datetime('now', '-30 days')`).get().c,
        failed_recent: (failedPosts || []).map(p => ({ id: p.id, email: p.email || '?', error: (p.error || '').slice(0, 90), at: p.created_at })),
        stuck_count: (stuck || []).length,
        stuck_recent: (stuck || []).map(p => ({ id: p.id, email: p.email || '?', at: p.scheduled_at })),
      };
    } catch (e) { out.health = null; }
    // 💵 CAC: gasto en ads (carga manual) vs pagos
    try {
      const spend30 = db.prepare(`SELECT COALESCE(SUM(amount_usd), 0) AS s FROM ad_spend WHERE date >= date('now', '-30 days')`).get().s;
      const paid30 = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE name = 'payment_ok' AND datetime(created_at) >= datetime('now', '-30 days')`).get().c;
      const byCamp = db.prepare(`SELECT campaign, COALESCE(SUM(amount_usd), 0) AS spend FROM ad_spend
        WHERE date >= date('now', '-90 days') GROUP BY campaign ORDER BY spend DESC LIMIT 10`).all();
      const paidByUtm = db.prepare(`SELECT COALESCE(NULLIF(utm_campaign, ''), '(sin utm)') AS camp, COUNT(*) AS n FROM users
        WHERE plan_status = 'active' AND datetime(created_at) >= datetime('now', '-90 days') GROUP BY camp ORDER BY n DESC LIMIT 10`).all();
      out.cac = { spend_30d: Math.round(spend30 * 100) / 100, paid_30d: paid30,
        cac: paid30 ? Math.round(spend30 / paid30 * 100) / 100 : 0,
        by_campaign: (byCamp || []).map(c => ({ campaign: c.campaign || '(sin nombre)', spend: Math.round(c.spend * 100) / 100 })),
        paid_by_utm: (paidByUtm || []).map(c => ({ campaign: c.camp, n: c.n })) };
      out.spend_recent = db.prepare(`SELECT id, date, campaign, amount_usd FROM ad_spend ORDER BY date DESC, id DESC LIMIT 15`).all();
    } catch (e) { out.cac = null; }
    // 🔗 Referidos: clicks en el link (embudo completo)
    try {
      const clicks = db.prepare(`SELECT JSON_EXTRACT(props, '$.code') AS code, COUNT(*) AS n FROM events
        WHERE name = 'ref_click' AND datetime(created_at) >= datetime('now', '-90 days') AND code IS NOT NULL
        GROUP BY code ORDER BY n DESC LIMIT 20`).all();
      out.ref_clicks = (clicks || []).map(c => ({ code: String(c.code || '').toLowerCase(), n: c.n }));
    } catch (e) { out.ref_clicks = []; }
    try {
      const alerts = [];
      const reg5 = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE datetime(created_at) >= datetime('now', '-5 days')`).get().c;
      if (!reg5) alerts.push({ sev: 'high', text: 'Sin registros en los últimos 5 días.' });
      const paidCur = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE name = 'payment_ok' AND datetime(created_at) >= datetime('now', '-30 days')`).get().c;
      const paidPrev = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE name = 'payment_ok' AND datetime(created_at) >= datetime('now', '-60 days') AND datetime(created_at) < datetime('now', '-30 days')`).get().c;
      if (paidPrev >= 2 && paidCur < paidPrev * 0.5) alerts.push({ sev: 'high', text: `Pagos en caída: ${paidCur} vs ${paidPrev} en los 30 días anteriores.` });
      if (out.money && out.money.ai_cost_30d > 1 && out.money.ai_cost_today > 3 * (out.money.ai_cost_30d / 30))
        alerts.push({ sev: 'high', text: `Gasto de IA disparado hoy: $${out.money.ai_cost_today} vs $${(out.money.ai_cost_30d / 30).toFixed(2)} promedio.` });
      const churn = db.prepare(`SELECT u.id, u.email, u.plan, u.plan_status, u.created_at,
          MAX(p.published_at) AS last_pub,
          (SELECT MAX(e.created_at) FROM events e WHERE e.user_id = u.id) AS last_act
        FROM users u LEFT JOIN posts p ON p.user_id = u.id AND p.status = 'published' AND p.published_at IS NOT NULL
        WHERE u.plan_status IN ('active', 'trial')
        GROUP BY u.id
        HAVING (datetime(u.created_at) < datetime('now', '-7 days') AND last_pub IS NULL)
            OR datetime(last_pub) < datetime('now', '-7 days')
        ORDER BY last_pub ASC NULLS FIRST LIMIT 30`).all();
      out.churn = (churn || []).map(c => ({
        email: c.email, plan: c.plan || 'trial', status: c.plan_status,
        days_since_signup: Math.floor((Date.now() - new Date((c.created_at || '').replace(' ', 'T') + 'Z').getTime()) / 864e5),
        last_pub: c.last_pub || null, last_act: c.last_act || null,
      }));
      if (out.churn.length) alerts.push({ sev: 'med', text: `${out.churn.length} cliente(s) sin publicar hace 7+ días — escribiles antes de que cancelen.` });
      out.alerts = alerts;
    } catch (e) { out.alerts = []; out.churn = []; }
    // 🚀 Readiness de inversión: ¿vale la pena meter los $5000/mes?
    try {
      const trials30 = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE datetime(created_at) >= datetime('now', '-30 days')`).get().c;
      const paidEv30 = db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM events WHERE name = 'payment_ok' AND user_id IS NOT NULL AND datetime(created_at) >= datetime('now', '-30 days')`).get().c;
      const old = db.prepare(`SELECT COUNT(*) AS t, SUM(CASE WHEN plan_status = 'active' THEN 1 ELSE 0 END) AS a FROM users
        WHERE datetime(created_at) < datetime('now', '-35 days')`).get();
      const h = out.health || {};
      out.readiness = {
        trials_30d: trials30,
        trial_paid_pct: trials30 ? Math.round(paidEv30 / trials30 * 1000) / 10 : 0,
        retention_old_pct: old && old.t ? Math.round(old.a / old.t * 1000) / 10 : 0,
        retention_n: (old && old.t) || 0,
        gen_rate: h.gen_rate || 0,
        failed_30d: h.failed_posts_30d || 0,
        stuck: h.stuck_count || 0,
        cac_measured: (out.cac && out.cac.spend_30d > 0 && out.cac.paid_30d > 0) ? true : false,
      };
    } catch (e) { out.readiness = null; }
  } catch (e) { console.error('[admin/growth]', e.message); }
  res.json({ ok: true, growth: out });
});

// Buscar usuarios por email (para el timeline)
app.get('/api/admin/users', requireAdminToken, (req, res) => {
  const q = '%' + String(req.query.q || '').trim().toLowerCase().slice(0, 60) + '%';
  let rows = [];
  try {
    rows = db.prepare(`SELECT id, email, created_at, plan, plan_status FROM users
      WHERE lower(email) LIKE ? ORDER BY id DESC LIMIT 20`).all(q);
  } catch (e) {}
  res.json({ ok: true, users: rows });
});

// ---------- "Primera semana con rueditas": cola de revisión ----------
// Los borradores con needs_review=1 los revisa el equipo (o un agente) antes de
// que el cliente los vea. API JSON para consumo por máquina, con ADMIN_TOKEN.

// URL de imagen para el revisor. Best-effort absoluta: usa IMAGE_BASE_URL o
// settings.image_base_url; si no hay base, devuelve la ruta relativa.
function absImageUrl(uid, imagePath) {
  const p = String(imagePath || '');
  if (!p) return '';
  // Migración de dominio: URLs absolutas viejas se reescriben al dominio nuevo.
  if (/^https?:\/\//i.test(p)) return p.replace(/https?:\/\/(www\.)?postahacetodo\.com/i, 'https://postyhacetodo.com');
  try {
    const st = (typeof getSettings === 'function' && getSettings(uid)) || {};
    const base = String(process.env.IMAGE_BASE_URL || st.image_base_url || '').replace(/\/$/, '');
    if (base) return base + (p.startsWith('/') ? p : '/' + p);
  } catch (e) {}
  return p;
}

// GET /api/admin/review-queue?token=ADMIN_TOKEN
// Cola de borradores pendientes de revisión (los más viejos primero).
app.get('/api/admin/review-queue', requireAdminToken, (req, res) => {
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT p.id, p.user_id, u.email, pr.business_name, p.image_path, p.caption, p.hashtags,
             p.media_type, p.tipo, p.source_topic, p.strategy_why, p.created_at
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
      WHERE p.status = 'draft' AND COALESCE(p.needs_review, 0) = 1
      ORDER BY p.created_at ASC LIMIT 100`).all();
  } catch (e) { return res.status(500).json({ ok: false, error: 'db' }); }
  res.json({ ok: true, count: rows.length, queue: rows.map(r => ({
    id: r.id, user_id: r.user_id, email: r.email || '',
    business_name: r.business_name || '',
    image_url: absImageUrl(r.user_id, r.image_path),
    caption: r.caption || '', hashtags: r.hashtags || '',
    media_type: r.media_type || 'image', tipo: r.tipo || '',
    source_topic: r.source_topic || '', strategy_why: r.strategy_why || '',
    created_at: r.created_at,
  })) });
});

// POST /api/admin/review/:id/approve?token=ADMIN_TOKEN
// Aprueba: el borrador queda visible para el cliente + se guarda golden example.
app.post('/api/admin/review/:id/approve', requireAdminToken, (req, res) => {
  const post = db.prepare(`SELECT * FROM posts WHERE id = ? AND status = 'draft' AND COALESCE(needs_review,0)=1`).get(req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'not_found' });
  db.prepare(`UPDATE posts SET needs_review = 0 WHERE id = ?`).run(post.id);
  saveGoldenExample(post.user_id, post.id, post.caption, [post.strategy_why, post.tipo].filter(Boolean).join(' · '));
  const approved = autopilot.maybeGraduate(db, post.user_id);
  console.log(`[review] aprobado borrador ${post.id} (usuario ${post.user_id}), golden #${approved}`);
  res.json({ ok: true, id: post.id, approved_count: approved, graduated: approved >= GOLDEN_TARGET });
});

// POST /api/admin/review/:id/edit?token=ADMIN_TOKEN  body {caption?, hashtags?, image_brief?}
// Aplica los cambios, aprueba y guarda el golden example con lo FINAL.
app.post('/api/admin/review/:id/edit', requireAdminToken, (req, res) => {
  const post = db.prepare(`SELECT * FROM posts WHERE id = ? AND status = 'draft' AND COALESCE(needs_review,0)=1`).get(req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'not_found' });
  const { caption, hashtags, image_brief } = req.body || {};
  const finalCaption = caption !== undefined ? String(caption) : (post.caption || '');
  const finalTags = hashtags !== undefined ? String(hashtags) : (post.hashtags || '');
  db.prepare(`UPDATE posts SET caption = ?, hashtags = ?, needs_review = 0 WHERE id = ?`).run(finalCaption, finalTags, post.id);
  const brief = image_brief !== undefined ? String(image_brief) : [post.strategy_why, post.tipo].filter(Boolean).join(' · ');
  saveGoldenExample(post.user_id, post.id, finalCaption, brief);
  const approved = autopilot.maybeGraduate(db, post.user_id);
  console.log(`[review] editado+aprobado borrador ${post.id} (usuario ${post.user_id}), golden #${approved}`);
  res.json({ ok: true, id: post.id, approved_count: approved, graduated: approved >= GOLDEN_TARGET });
});

// POST /api/admin/review/:id/reject?token=ADMIN_TOKEN  body {note}
// Rechaza con nota: alimenta el aprendizaje (señal + style_rule), borra el
// borrador y regenera uno con otro enfoque en segundo plano.
app.post('/api/admin/review/:id/reject', requireAdminToken, (req, res) => {
  const post = db.prepare(`SELECT * FROM posts WHERE id = ? AND status = 'draft' AND COALESCE(needs_review,0)=1`).get(req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'not_found' });
  const note = String(((req.body || {}).note) || '').slice(0, 500);
  const uid = post.user_id;
  try {
    const prof = (typeof getProfile === 'function' && getProfile(uid)) || {};
    db.prepare(`INSERT INTO post_signals (user_id, post_id, caption, hashtags, scheduled_for, rubro, client_signal, week_key, updated_at)
      VALUES (?,?,?,?,?,?,'rejected',?,datetime('now'))
      ON CONFLICT(user_id, post_id) DO UPDATE SET client_signal='rejected', caption=excluded.caption, updated_at=datetime('now')`)
      .run(uid, post.id, post.caption || '', post.hashtags || '', '', prof.category || '', post.week_key || '');
    if (note) {
      db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 1)
        ON CONFLICT(user_id, rule_key) DO UPDATE SET rule_text=excluded.rule_text, active=1, hits=hits+1`)
        .run(uid, 'review-' + post.id, 'Revisión: ' + note);
    }
    db.prepare(`DELETE FROM posts WHERE id = ?`).run(post.id);
  } catch (e) { return res.status(500).json({ ok: false, error: 'db' }); }
  regenerateOneDraft(uid, post.week_key || '', post.source_topic || '')
    .catch(e => console.error('[review] regen:', e.message));
  console.log(`[review] rechazado borrador ${post.id} (usuario ${uid}), regenerando`);
  res.json({ ok: true, id: post.id, regenerating: true });
});

// Regenera UN borrador para reemplazar uno rechazado en revisión. El rechazo ya
// alimenta excludedTopicsLine() vía post_signals, así que la idea sale con otro
// enfoque automáticamente. El nuevo borrador nace con rueditas si corresponde.
async function regenerateOneDraft(uid, weekKey, rejectedTopic) {
  const key = openaiKeyFor(uid);
  if (!key) return { ok: false, reason: 'no_key' };
  const ideas = await generateIdeas(ideasInputFor(uid), key);
  const rej = String(rejectedTopic || '').toLowerCase().slice(0, 24);
  const idea = ((ideas || []).find(i => !rej || !String(i.titulo || '').toLowerCase().includes(rej)) || (ideas || [])[0]);
  if (!idea) return { ok: false, reason: 'no_ideas' };
  const content = await generateContent(contentInputFor(uid, idea.titulo, idea.tipo, 0), key);
  const caption = String((content && content.caption) || '').trim();
  if (!caption) return { ok: false, reason: 'no_caption' };
  recordHookUse(uid, content && content.hookId); // hook engine: rotación 8 semanas
  const hashtags = String((content && content.hashtags) || '');
  const headline = makeHeadline(caption.split('\n')[0], 6) || makeHeadline(idea.titulo, 5);
  let refs = [];
  try { refs = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY created_at DESC LIMIT 2`).all(uid).map(r => r.file_path); } catch (e) {}
  const styleOut2 = {};
  // INVARIANTE: todo borrador sale con imagen real de IA. Si la IA falla
  // tras reintentos, no se crea el borrador (nunca un bloque plano).
  let imagePath = null;
  // Reference lock: la primera foto de producto de la semana (misma que el
  // pipeline) para que el producto se vea idéntico.
  let regenProductRef = null;
  try {
    const r = db.prepare(`SELECT image_path FROM posts WHERE user_id = ? AND week_key = ?
      AND intent = 'producto' AND image_path LIKE '/media/%' AND status != 'cancelled'
      ORDER BY id ASC LIMIT 1`).get(uid, weekKey || '');
    const p = r && String(r.image_path || '');
    if (p && fs.existsSync(path.join(MEDIA_DIR, path.basename(p)))) regenProductRef = p;
  } catch (e) {}
  // Reintentos de imagen IA (2026-10-06, Valentino): sin fallback plano.
  // Si la IA falla tras 3 intentos, no se crea el borrador.
  for (let attempt = 0; attempt < 3 && !imagePath; attempt++) {
    try {
      imagePath = await conceptShotGenerateQueued({
        uid, idea: { titulo: idea.titulo, porque: idea.porque || idea.angulo },
        tipo: idea.tipo, headline, refs, apiKey: key, styleOut: styleOut2, productRef: regenProductRef,
      });
    } catch (e) {
      console.error(`[review] IA imagen falló (intento ${attempt + 1}/3):`, e.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
    }
  }
  if (!imagePath) return { ok: false, reason: 'no_image' };
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, source_angle, tipo, strategy_why, week_key, needs_review, style_code, style_reason, intent, product_ref, hook_id)
    VALUES (?,?,?,?, 'draft','image',?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid, imagePath, caption, hashtags, idea.titulo || '', idea.angulo || '', idea.tipo || '',
      String(idea.porque || '').slice(0, 500), weekKey || '', trainingWheelsActive(uid) ? 1 : 0,
      String(styleOut2.code || ''), String(styleOut2.reason || ''), String(styleOut2.intent || ''), String(regenProductRef || ''), String((content && content.hookId) || ''));
  console.log(`[review] regenerado borrador ${r.lastInsertRowid} para usuario ${uid}`);
  return { ok: true, id: r.lastInsertRowid };
}

// Estado de revisión para el cliente: ¿tiene borradores en el horno?
app.get('/api/review-status', requireAuth, (req, res) => {
  let pending = 0;
  try {
    pending = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=1`).get(req.session.userId).n || 0;
  } catch (e) {}
  res.json({ ok: true, training_wheels: trainingWheelsActive(req.session.userId), pending });
});

// ---------- 📊 Tus números: métricas reales de Instagram del cliente ----------
// OJO: /api/stats/summary YA existe (dashboard "Mi semana": actividad de posteos,
// NUNCA métricas de IG). Este endpoint va en /api/stats/ig para no pisarlo.
const statsMod = require('./stats');
app.get('/api/stats/ig', requireAuth, async (req, res) => {
  const uid = req.session.userId;
  try {
    let s = statsMod.buildSummary(db, uid);
    const empty = !s.reach_7d && !s.reach_30d && !s.interactions_30d && !s.best_post;
    if (empty) {
      // Sin caché: intentar traer frescas de la API de IG antes de devolver ceros.
      await statsMod.refreshMetrics(db, uid);
      s = statsMod.buildSummary(db, uid);
    }
    s.followers = await statsMod.refreshFollowers(db, uid);
    res.json(s);
  } catch (e) {
    console.error('[stats/ig]', e.message);
    res.json({ reach_7d: 0, reach_30d: 0, interactions_30d: 0, followers: 0, reach_prev7d: 0, posts_7d: 0, posts_prev7d: 0, best_post: null });
  }
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
    // FIX (2026-10-02): 500 para que MP reintente (antes 200 = pago perdido).
    res.status(500).json({ ok: false, error: 'retry' });
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
  try {
  const postId = Number(req.body.post_id) || 0;
  const budgetCents = Math.round(Number(req.body.budget_cents) || 0);
  if (!postId) return res.status(400).json({ error: 'Elegí un posteo' });
  if (!(budgetCents >= AD_MIN_BUDGET_CENTS)) {
    return res.status(400).json({ error: `El presupuesto mínimo por pauta es de ${fmtARS(AD_MIN_BUDGET_CENTS)}` });
  }
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(postId, req.session.userId);
  if (!post || !post.ig_media_id) {
    return res.status(400).json({ error: 'Primero publiquemos ese posteo en Instagram, después lo potenciamos 🚀' });
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
        name: `Posty · Boost #${boostId} · u${req.session.userId}`,
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
  } catch (e) {
    // FAIL-SAFE (2026-10-02): un throw acá antes mataba el proceso entero
    // (unhandled rejection en Express 4 + Node 24). Ahora responde 500.
    console.error('[ads/boost] error:', e.message);
    try { if (!res.headersSent) res.status(500).json({ error: 'No pude crear la pauta 😅 Probá de nuevo.' }); } catch (e2) {}
  }
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
    res.status(500).json({ error: 'No pude revisar los comentarios 😅 Probá de nuevo' });
  }
});
app.post('/api/comments/:id/reply', requireAuth, async (req, res) => {
  try {
    const { replyComment } = require('./insights');
    const c = db.prepare('SELECT * FROM comment_queue WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
    if (!c || c.status !== 'pending') return res.status(404).json({ error: 'Ese comentario se me perdió 😅 Actualizá y probá de nuevo' });
    const message = String((req.body && req.body.message) || c.suggested || '').slice(0, 1000);
    if (!message.trim()) return res.status(400).json({ error: 'Escribí la respuesta primero ✍️' });
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

// Sugerencia de arranque (first_pick): qué posteo mirar primero.
// Determinista y explicable:
//   1. borrador cuya imagen usa una FOTO REAL del cliente (client_photo=1,
//      marcado por importTrialWeek) → la gente no odia sus propias fotos;
//   2. fallback: primer borrador de la semana (orden id ASC).
// El reason es SUGERENCIA, nunca veredicto: fundamento seguro
// ("usa una de tus fotos 📸", "tiene los colores de tu marca 🎨"), jamás
// "mi favorito".
function firstPickFrom(drafts) {
  if (!drafts || !drafts.length) return null;
  let pick = drafts.find((d) => Number(d.client_photo) === 1) || null;
  let reason = 'usa una de tus fotos 📸';
  if (!pick) { pick = drafts[0]; reason = 'tiene los colores de tu marca 🎨'; }
  return { post_id: pick.id, image_url: pick.image_path, caption: String(pick.caption || ''), reason };
}

// Historial del chat consultor (persiste entre sesiones) + idea cerrada pendiente
app.get('/api/ideas/chat', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const msgs = db.prepare(`SELECT role, text FROM chat_messages WHERE user_id=? AND created_at > datetime('now', '-24 hours') ORDER BY id DESC LIMIT 30`).all(uid).reverse();
  const st = db.prepare('SELECT idea_json FROM chat_state WHERE user_id=?').get(uid);
  let idea = null;
  try { idea = st ? JSON.parse(st.idea_json) : null; } catch (e) { idea = null; }
  // Bienvenida proactiva: SOLO el primer ingreso. Si el usuario trae semana
  // importada de /prueba (marcador: source='trial', o prefijo legacy
  // '/media/trial-' para imports anteriores a la migración), continuidad:
  // la semana YA está acá, no se dice "estoy laburando". Si no, el flujo
  // actual (Posty contando qué está haciendo AHORA por sus posteos).
  // Además: first_pick = sugerencia del primer posteo a mirar (solo si hay
  // borradores y es primera apertura, mismo gate que welcome).
  let welcome = null;
  let first_pick = null;
  let welcome_regen = false;
  try {
    const w = db.prepare('SELECT posty_welcomed, client_name, trial_import_n FROM users WHERE id = ?').get(uid) || {};
    if (!w.posty_welcomed) {
      const _cn = ((w.client_name || '').trim().split(/\s+/)[0]) || '';
      const draftSel = 'id, image_path, caption, COALESCE(client_photo, 0) AS client_photo FROM posts WHERE user_id = ? AND status = \'draft\'';
      const trialDrafts = db.prepare(
        `SELECT ${draftSel} AND (COALESCE(source, '') = 'trial' OR image_path LIKE '/media/trial-%') ORDER BY id ASC`
      ).all(uid);
      // Fix auditoría #2: la rama de continuidad SOLO si la semana importada
      // existe de verdad. Si vino de /prueba con @ pero la importación trajo 0
      // (cache vencido / payload roto → trial_import_n = 0), se dice la verdad
      // y se ofrece rearmarla en 1 tap. NULL = no vino de /prueba (welcome actual).
      const importMissed = w.trial_import_n === 0;
      if (trialDrafts.length) {
        welcome = (_cn ? `\u00A1${_cn}! \uD83C\uDF89 Tu semana ya est\u00E1 ac\u00E1 \u2014 la que armamos juntos en la prueba \u2728`
                      : '\u00A1Hola! \uD83C\uDF89 Tu semana ya est\u00E1 ac\u00E1 \u2014 la que armamos juntos en la prueba \u2728');
        first_pick = firstPickFrom(trialDrafts);
      } else if (importMissed) {
        // La semana de /prueba no llegó adentro: decir la verdad con voz de
        // Posty y 1 tap para rearmarla (welcome_regen → botón en el frontend).
        welcome = (_cn ? `\u00A1${_cn}! ` : '\u00A1Hola! ') +
          'No encontr\u00E9 tu semana de prueba \uD83D\uDE05 \u2014 te la rearmo en 1 minuto \uD83D\uDC47';
        welcome_regen = true;
      } else {
        const bits = [];
        try { if ((db.prepare(`SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo'`).get(uid) || {}).n > 0) bits.push('mirando tus fotos \uD83D\uDCF8'); } catch (e) {}
        try { const dr = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid); if (dr && dr.dna_json) bits.push('conociendo tu negocio'); } catch (e) {}
        try { const pf = db.prepare('SELECT ig_connected FROM profiles WHERE user_id = ?').get(uid); if (pf && pf.ig_connected) bits.push('analizando tu Instagram'); } catch (e) {}
        bits.push('buscando los mejores horarios para publicar \u23F0');
        const haciendo = bits.length > 1 ? bits.slice(0, -1).join(', ') + ' y ' + bits[bits.length - 1] : bits[0];
        welcome = (_cn ? `\u00A1Hola ${_cn}! Soy Posty, tu community manager \uD83C\uDF89\n`
                        : '\u00A1Hola! Soy Posty, tu community manager \uD83C\uDF89\n') +
          `Ya estoy laburando en tus posteos: ${haciendo}.\n` +
          'Yo armo los dise\u00F1os, textos y horarios \u2014 vos solo aprob\u00E1s \uD83D\uDC4C\n' +
          'Te aviso cuando tu semana est\u00E9 lista \u2728' +
          (_cn ? '' : '\n\u00BFC\u00F3mo te llamo? \uD83D\uDE04');
        try {
          const otherDrafts = db.prepare(`SELECT ${draftSel} ORDER BY id ASC`).all(uid);
          first_pick = firstPickFrom(otherDrafts);
        } catch (e) {}
      }
      db.prepare('UPDATE users SET posty_welcomed = 1 WHERE id = ?').run(uid);
    }
  } catch (e) { console.error('[chat] welcome:', e.message); }
  res.json({ messages: msgs, idea: idea && idea.titulo ? idea : null, welcome, first_pick, welcome_regen });
});

// Feedback de la sugerencia de arranque (first_pick): el usuario elige el
// posteo sugerido, otro, o la descarta. Es la PRIMERA señal de taste del
// usuario → se guarda en post_signals ('picked'→'approved',
// 'other'/'dismissed'→'rejected').
// Idempotente por (user_id, post_id): ON CONFLICT DO NOTHING — no duplica ni
// pisa una señal anterior si reintentan.
app.post('/api/posty/pick-feedback', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const { post_id, choice } = req.body || {};
    const pid = parseInt(post_id, 10);
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'post_id inválido' });
    if (!['picked', 'other', 'dismissed'].includes(choice)) return res.status(400).json({ error: 'choice inválido' });
    const post = db.prepare('SELECT id, caption, hashtags, scheduled_at, week_key FROM posts WHERE id = ? AND user_id = ?').get(pid, uid);
    if (!post) return res.status(404).json({ error: 'Posteo no encontrado' });
    const signal = choice === 'picked' ? 'approved' : 'rejected';
    db.prepare(`
      INSERT INTO post_signals (user_id, post_id, caption, hashtags, scheduled_for, client_signal, week_key, updated_at)
      VALUES (?,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(user_id, post_id) DO NOTHING
    `).run(uid, post.id, post.caption || '', post.hashtags || '', post.scheduled_at || '', signal, post.week_key || '');
    const reply = choice === 'picked'
      ? '¡Buena elección! 👌 Lo dejamos primero en tu semana ✨'
      : 'Anotado ✍️ — la próxima apunto mejor 💪';
    res.json({ ok: true, reply });
  } catch (e) { console.error('[posty] pick-feedback:', e.message); res.status(500).json({ error: 'No pude anotarlo 😅 Probá de nuevo' }); }
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
  } catch (e) { res.status(500).json({ error: 'No pude guardarlo 😅 Probá de nuevo' }); }
});

// ---------- Track 4 "Pipeline perpetuo": builders de input reutilizables ----------
// Misma entrada que arma /api/ideas a mano: extraída para que el pipeline
// server-side (N+1 y reconstrucción) genere con EXACTAMENTE el mismo contexto
// (ADN, learnings, style_rules, excluidos, aprobados, outcome). Sin drift.
function openaiKeyFor(uid) {
  try { return getSettings(uid).openai_key || process.env.OPENAI_API_KEY || ''; }
  catch (e) { return process.env.OPENAI_API_KEY || ''; }
}
function ideasInputFor(uid) {
  const profile = getProfile(uid);
  const dna = readDna(uid);
  let recentTopics = '';
  try {
    const recent = db.prepare(`SELECT caption FROM posts WHERE user_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 12`).all(uid);
    recentTopics = recent.map(r => String(r.caption || '').split('\n')[0].slice(0, 80)).filter(Boolean).join(' | ');
  } catch (e) { /* sin historial: no se filtra nada */ }
  let styleRules = [];
  try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(uid).map(r => r.rule_text); } catch (e) {}
  // Niveles que se sienten: el nivel cambia REALMENTE el payload de ideas.
  return levelBoosted(uid, 'ideas', {
    business: profile.business_name,
    ig_username: profile.ig_username || '', // el crítico permite mencionar la cuenta propia (draft 74)
    category: profile.category,
    tone: profile.tone,
    description: profile.description,
    dna,
    competitors: profile.competitors,
    goal: profile.goal,
    taste: tasteProfile(uid),
    recentTopics,
    ephemeris: upcomingEphemeris(12)[0] || null,
    learnings: getContentLearnings(uid),
    styleRules,
    excluded: excludedTopicsLine(uid),
    approved: approvedTopicsLine(uid),
    outcome: outcomeBrief(uid),
    contentPerf: contentPerformanceLine(uid),
  });
}
// Hook engine: rotación de 8 semanas por cliente (hooks.js).
// Nunca rompe: errores → sin rotación (el motor igual elige).
function recentHookIds(uid) {
  try {
    return db.prepare(`SELECT DISTINCT hook_id FROM hook_usage WHERE user_id = ? AND used_at > datetime('now','-56 days')`).all(uid).map(r => r.hook_id).filter(Boolean);
  } catch (e) { return []; }
}
function recordHookUse(uid, hookId) {
  if (!uid || !hookId) return;
  try { db.prepare(`INSERT INTO hook_usage (user_id, hook_id) VALUES (?,?)`).run(uid, hookId); } catch (e) {}
}
function contentInputFor(uid, topic, tipo, seed) {
  const profile = getProfile(uid);
  let styleRules = [];
  try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(uid).map(r => r.rule_text); } catch (e) {}
  let voice = '';
  try { if (typeof voiceExamples === 'function') voice = voiceExamples(db, uid) || ''; } catch (e) {}
  // Niveles que se sienten: el nivel cambia REALMENTE el payload de captions.
  return levelBoosted(uid, 'caption', {
    userId: uid, // hook engine: rotación de hooks por cliente
    usedHookIds: recentHookIds(uid), // hooks usados en las últimas 8 semanas
    business: profile.business_name,
    ig_username: profile.ig_username || '', // el crítico permite mencionar la cuenta propia (draft 74)
    category: profile.category,
    description: profile.description,
    dna: readDna(uid),
    tone: profile.tone,
    topic: String(topic || '').trim(),
    tipo: tipo || '',
    competitors: profile.competitors,
    goal: profile.goal,
    taste: tasteProfile(uid),
    performance: [performanceBrief(db, uid), bestHoursLine(db, uid)].filter(Boolean).join('\n'),
    styleRules,
    voice,
    seedBase: parseInt(seed, 10) || 0,
    golden: goldenExamples(uid), // "rueditas": posteos aprobados como few-shot ("así o parecido")
    captionExtras: captionExtrasFor(uid), // checklist anti-genérico + voz real del cliente (Caption Style Lock)
  });
}
app.post('/api/ideas', requireAuth, requireTrialValid, async (req, res) => {
  const uidIdeas = req.session.userId;
  // Kill-switch de gasto diario.
  try { costs.assertAiOk(uidIdeas); }
  catch (e) { if (e && e.name === 'AiCapExceeded') return res.status(429).json({ error: e.message }); throw e; }
  // Rate limits: semana/autopilot máx 3/día, ideas máx 20/día (anti-abuso).
  // 429 para que el frontend muestre el mensaje amable tal cual (sin prefijo "Error:").
  // Rate limits por plan (2026-10-02): 1 semana/día en todos los planes.
  if (!costs.checkRate(uidIdeas, 'week', aiLimitsFor(uidIdeas).weeksPerDay).ok) return res.status(429).json({ error: costs.MSG_WEEK_RATE });
  if (!costs.checkRate(uidIdeas, 'ideas', 20).ok) return res.status(429).json({ error: costs.MSG_IDEAS_RATE });
  const profile = getProfile(req.session.userId);
  const dna = readDna(req.session.userId);
  // Gate anti-invención: sin datos mínimos del negocio no se genera nada.
  // Generar con el perfil vacío es lo que produce posteos inventados ("PRODCT XYZ").
  const descOk = (profile.description || '').trim().length >= 20;
  const dnaOk = (dna.producto_estrella || '').trim().length >= 3;
  if (!descOk && !dnaOk) return res.json({ need_profile: true });
  try {
    const ideas = await generateIdeas(ideasInputFor(req.session.userId), openaiKeyFor(req.session.userId));
    res.json({ ideas });
  } catch (e) {
    res.status(500).json({ error: 'Hoy las ideas no me salen 😅 Dame otro intento' });
  }
});

// ---------- Subida de imagen (PNG del diseñador) ----------
app.post('/api/media', requireAuth, express.raw({ type: 'image/*', limit: '15mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Imagen vacía' });
  const ct = req.get('Content-Type') || '';
  const ext = ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
  const filePath = `/media/${name}`;
  // La foto subida en el chat también queda en su librería: así el servidor
  // puede resolverla cuando Posty la elige (photo_index) en un ```edit.
  // FIX-FANTASMA: ?kind=design para diseños generados (renderDesignImage), que
  // NO deben mezclarse con las fotos reales en assetPhotos(). Default 'photo'
  // por compatibilidad (el chat sube fotos reales por este endpoint sin kind).
  // Cualquier valor distinto de 'design' cae a 'photo'.
  const qk = req.query.kind;
  const kind = qk === 'design' ? 'design' : 'photo';
  try {
    db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)').run(req.session.userId, filePath, kind);
  } catch (e) { console.error('[media] assets insert:', e.message); }
  res.json({ path: filePath });
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
  if (kind === 'video' && !ct.startsWith('video/')) return res.status(400).json({ error: 'Eso no es un video 😅 Probá con un MP4' });
  if (kind !== 'video' && !ct.startsWith('image/')) return res.status(400).json({ error: 'Eso no es una imagen 😅 Probá con un JPG o PNG' });
  if (kind === 'photo') {
    const n = db.prepare(`SELECT COUNT(*) AS c FROM assets WHERE user_id = ? AND kind = 'photo'`).get(req.session.userId).c;
    if (n >= 20) return res.status(400).json({ error: '¡20 fotos! Con esas me alcanza y sobra 📸' });
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

// Logo auto-extraído (ver extractLogoCandidate en style-visual.js).
// GET: devuelve la candidata pendiente, o path:null si no hay (o el archivo ya no existe).
app.get('/api/brand/logo-candidate', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const cand = String((getSettings(uid) || {}).logo_candidate || '').trim();
    if (!cand) return res.json({ ok: true, path: null });
    if (!fs.existsSync(path.join(MEDIA_DIR, path.basename(cand)))) {
      try { db.prepare('UPDATE settings SET logo_candidate = ? WHERE user_id = ?').run('', uid); } catch (_) {}
      return res.json({ ok: true, path: null });
    }
    res.json({ ok: true, path: cand });
  } catch (e) {
    console.error('[logo] candidate:', e.message);
    res.status(500).json({ ok: false, error: 'No pude ver la candidata 😅' });
  }
});

// POST: confirma la candidata → pasa a ser el logo de marca (asset kind='logo'),
// reemplazando el anterior si existe. Mismo patrón que el upload de logo del
// brand kit: DELETE previos (borrando archivos) + INSERT nuevo.
app.post('/api/brand/logo-confirm', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const s = getSettings(uid);
    const cand = String((s || {}).logo_candidate || '').trim();
    if (!cand || !fs.existsSync(path.join(MEDIA_DIR, path.basename(cand)))) {
      try { db.prepare('UPDATE settings SET logo_candidate = ? WHERE user_id = ?').run('', uid); } catch (_) {}
      return res.status(404).json({ ok: false, error: 'La candidata ya no está' });
    }
    // Reemplaza el anterior (un solo logo por marca), como el upload del brand kit.
    const olds = db.prepare(`SELECT id, file_path FROM assets WHERE user_id = ? AND kind = 'logo'`).all(uid);
    for (const o of olds) {
      try { fs.unlinkSync(path.join(MEDIA_DIR, path.basename(o.file_path))); } catch (_) {}
    }
    db.prepare(`DELETE FROM assets WHERE user_id = ? AND kind = 'logo'`).run(uid);
    db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?,?,?)').run(uid, cand, 'logo');
    // Limpiar la candidata después de confirmarla.
    try { db.prepare('UPDATE settings SET logo_candidate = ? WHERE user_id = ?').run('', uid); } catch (_) {}
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)')
      .run(uid, 'assistant', '¡Listo! 🎉 Tu logo va a salir idéntico en todos tus posteos');
    res.json({ ok: true, path: cand });
  } catch (e) {
    console.error('[logo] confirm:', e.message);
    res.status(500).json({ ok: false, error: 'No pude confirmar el logo 😅 Probá de nuevo' });
  }
});

// POST: rechaza la candidata → borra el archivo, limpia y marca descartada (no se vuelve a ofrecer).
app.post('/api/brand/logo-reject', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const cand = String((getSettings(uid) || {}).logo_candidate || '').trim();
    if (cand) { try { fs.unlinkSync(path.join(MEDIA_DIR, path.basename(cand))); } catch (_) {} }
    db.prepare('UPDATE settings SET logo_candidate = ?, logo_candidate_dismissed = 1 WHERE user_id = ?').run('', uid);
    res.json({ ok: true });
  } catch (e) {
    console.error('[logo] reject:', e.message);
    res.status(500).json({ ok: false, error: 'No pude descartarlo 😅' });
  }
});

app.delete('/api/assets/:id', requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!a) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
  // Si algún posteo ya usa esa foto, se conserva el archivo para no romperlo:
  // sale de la biblioteca (no se usa más en posteos nuevos) pero los existentes siguen viéndose.
  let used = 0;
  try {
    used = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND image_path = ?`).get(req.session.userId, a.file_path).c;
    if (!used) used = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND carousel_paths LIKE ?`).get(req.session.userId, `%${a.file_path}%`).c;
  } catch (e) {}
  if (!used) {
    try { fs.unlinkSync(path.join(MEDIA_DIR, path.basename(a.file_path))); } catch (_) {}
  }
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
    return res.status(503).json({ error: 'Video no disponible en el servidor todavía — probá en un rato 🙏' });
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
  const vis = `AND COALESCE(p.needs_review, 0) = 0`; // "rueditas": en revisión no se muestra
  let rows;
  if (status) {
    rows = db.prepare(`SELECT p.*, s.client_signal AS signal FROM posts p ${join} WHERE p.user_id = ? AND p.status = ? ${vis} ORDER BY p.scheduled_at ASC, p.created_at DESC`).all(req.session.userId, status);
  } else {
    rows = db.prepare(`SELECT p.*, s.client_signal AS signal FROM posts p ${join} WHERE p.user_id = ? ${vis} ORDER BY p.created_at DESC LIMIT 100`).all(req.session.userId);
  }
  res.json(rows);
});

// Si el usuario nunca configuró image_base_url, la deducimos del host actual (https en
// producción). Sin esto Instagram no puede descargar la imagen y la publicación real falla.
function ensureImageBaseUrl(db, userId, req) {
  try {
    if (process.env.IMAGE_BASE_URL) return;
    const rawHost = req.get('host') || '';
    if (!rawHost) return;
    const proto = /localhost|127\.0\.0\.1/.test(rawHost.split(':')[0]) ? 'http' : 'https';
    const cur = `${proto}://${rawHost}`;
    const s = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(userId);
    // Migración de dominio: si la base guardada apunta al dominio viejo, actualizarla.
    if (s && s.image_base_url && /postahacetodo\.com/i.test(s.image_base_url) && s.image_base_url !== cur) {
      db.prepare(`UPDATE settings SET image_base_url = ?, updated_at = datetime('now') WHERE user_id = ?`).run(cur, userId);
      return;
    }
    if (s && s.image_base_url) return;
    db.prepare(`UPDATE settings SET image_base_url = ?, updated_at = datetime('now') WHERE user_id = ?`).run(cur, userId);
  } catch (e) { /* no bloquea la creación del post */ }
}

app.post('/api/posts', requireAuth, requireTrialValid, (req, res) => {
  const { image_path, caption, hashtags, scheduled_at, media_type, source_topic, source_angle, carousel_paths, tipo, strategy_why, script } = req.body || {};
  if (!image_path) return res.status(400).json({ error: 'Falta la imagen' });
  // Anti-duplicados: mismo texto en las últimas 24h (no cancelado) = avisar en vez de crear otro
  const cap = (caption || '').trim();
  if (cap) {
    const dup = db.prepare(`SELECT id FROM posts WHERE user_id = ? AND status != 'cancelled' AND LOWER(TRIM(caption)) = LOWER(?) AND created_at > datetime('now', '-1 day')`).get(req.session.userId, cap);
    if (dup) return res.status(409).json({ error: 'Ya creaste este posteo hoy. Lo ves en tu historial.', post_id: dup.id });
  }
  const status = scheduled_at ? 'scheduled' : 'draft';
  const mt = media_type === 'video' ? 'video' : media_type === 'story' ? 'story' : media_type === 'carousel' ? 'carousel' : 'image';
  // Cupo del plan: solo las publicaciones consumen cupo (los borradores son gratis).
  // Cada formato consume SU cupo (posteos, reels, historias). El carrusel cuenta como 1 posteo.
  if (status === 'scheduled') {
    const q = quotaFor(req.session.userId, mt);
    if (q.left <= 0) {
      return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: q.limit, plan_name: q.plan_name,
        message: `Llegaste al límite de tu plan ${q.plan_name} (${q.limit} ${quotaUnitName(mt)} por semana). Mejorá tu paquete para seguir posteando esta semana.` });
    }
  }
  let cpaths = '';
  if (mt === 'carousel' && Array.isArray(carousel_paths)) {
    cpaths = JSON.stringify(carousel_paths.filter(Boolean).slice(0, 10));
  }
  // Guion del reel (segundo a segundo): viaja con el borrador para no perderse
  let scriptJson = '';
  if (Array.isArray(script)) {
    const scenes = script.slice(0, 6).map(sc => {
      if (!sc || typeof sc !== 'object') return null;
      const seg = String(sc.seg || '').slice(0, 12), visual = String(sc.visual || '').slice(0, 200), texto = String(sc.texto || '').slice(0, 200);
      return (seg || visual || texto) ? { seg, visual, texto } : null;
    }).filter(Boolean);
    if (scenes.length) scriptJson = JSON.stringify(scenes);
  }
  const r = db.prepare(
    'INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, source_topic, source_angle, carousel_paths, tipo, strategy_why, needs_review, script) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(req.session.userId, image_path, caption || '', hashtags || '', scheduled_at || null, status, mt, source_topic || '', source_angle || '', cpaths, ['promo','tip','social','detras','novedad'].includes(tipo) ? tipo : '', String(strategy_why || '').slice(0, 500), status === 'draft' && trainingWheelsActive(req.session.userId) ? 1 : 0, scriptJson);
  const newId = r.lastInsertRowid;

  // 🚀 Autopiloto (2026-10-02): si está activado y el borrador pasa el filtro
  // de calidad, se programa solo para mañana 10am. Si no pasa, queda en
  // revisión manual.
  let autopiloted = false;
  if (status === 'draft') {
    try {
      const ap = autopilot.shouldAutopublish(req.session.userId, newId, db, MEDIA_DIR);
      if (ap.ok) {
        // Horario óptimo (2026-10-03): usa la mejor hora del usuario según
        // engagement histórico. Si no hay datos, 10am por defecto.
        let bestHour = 10;
        try {
          const bh = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(req.session.userId);
          if (bh && bh.best_hour >= 0 && bh.best_hour <= 23) bestHour = bh.best_hour;
        } catch (e) {}
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        tomorrow.setHours(bestHour, 0, 0, 0);
        const schedAt = tomorrow.toISOString().slice(0, 16).replace('T', ' ');
        db.prepare(`UPDATE posts SET status = 'scheduled', scheduled_at = ?, auto_published = 1 WHERE id = ?`)
          .run(schedAt, newId);
        autopiloted = true;
        console.log(`[autopilot] post ${newId} programado solo para ${schedAt} (score ${ap.score})`);
      }
    } catch (e) {
      console.error('[autopilot] no pude auto-programar:', e.message);
    }
  }

  ensureImageBaseUrl(db, req.session.userId, req);
  res.json({ ok: true, id: newId, autopiloted });
});

app.patch('/api/posts/:id', requireAuth, (req, res) => {
  const { scheduled_at, caption, hashtags, image_path, action } = req.body || {};
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (post.needs_review) return res.status(403).json({ error: 'in_review', message: 'Este posteo está en revisión ✨ Te aviso cuando esté listo.' });
  if (action === 'cancel') {
    db.prepare(`UPDATE posts SET status='cancelled' WHERE id=?`).run(post.id);
    recordSignal(req.session.userId, post, 'rejected'); // lo canceló = no le gustó
  } else if (action === 'unschedule') {
    // Frenar el autopiloto (2026-10-02): vuelve a borrador, no se publica.
    db.prepare(`UPDATE posts SET status='draft', scheduled_at=NULL, auto_published=0 WHERE id=?`).run(post.id);
    console.log(`[autopilot] usuario ${req.session.userId} frenó el post ${post.id}`);
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
    // Programar SÍ consume cupo (las publicaciones son el límite del plan). Si el posteo
    // ya estaba programado/publicado, no se descuenta de nuevo.
    if (!['scheduled', 'publishing', 'published'].includes(post.status)) {
      const q = quotaFor(req.session.userId, post.media_type);
      if (q.left <= 0) {
        return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: q.limit, plan_name: q.plan_name,
          message: `Llegaste al límite de tu plan ${q.plan_name} (${q.limit} ${quotaUnitName(post.media_type)} por semana). Mejorá tu paquete para seguir posteando esta semana.` });
      }
    }
    db.prepare(`UPDATE posts SET scheduled_at=?, caption=?, hashtags=?, status='scheduled', error='', notified=?, approval=? WHERE id=?`).run(
      scheduled_at || post.scheduled_at, caption ?? post.caption, hashtags ?? post.hashtags,
      // "Posty te avisa": si cambió la hora programada, se re-arma el aviso de
      // aprobación (3h antes). Si el posteo estaba rechazado y el usuario lo
      // vuelve a programar a mano, es una intención nueva: vuelve a 'pending'.
      (scheduled_at || post.scheduled_at) !== post.scheduled_at ? 0 : (post.notified || 0),
      post.approval === 'rejected' ? 'pending' : (post.approval || 'pending'),
      post.id
    );
    // 🎓 Autopiloto graduado (2026-10-02): si programó SIN editar, es un voto
    // de confianza. A los 10, Posty ofrece el autopiloto.
    if (!edited && post.status === 'draft') {
      try {
        db.prepare(`UPDATE users SET clean_approvals = COALESCE(clean_approvals, 0) + 1 WHERE id = ?`)
          .run(req.session.userId);
        const u = db.prepare(`SELECT clean_approvals, autopilot_offered, autopilot_enabled FROM users WHERE id = ?`)
          .get(req.session.userId);
        if (u && (u.clean_approvals || 0) >= 10 && !u.autopilot_offered && !u.autopilot_enabled) {
          db.prepare(`UPDATE users SET autopilot_offered = 1 WHERE id = ?`).run(req.session.userId);
          // Posty le ofrece el autopiloto en el chat.
          try {
            db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`)
              .run(req.session.userId,
                `🚀 Ya aprobaste 10 posteos sin cambiarles nada — ¡parece que nos entendemos!\n\n` +
                `¿Querés que de ahora en más los publique solo? Te aviso 30 min antes de cada uno por si querés frenarlo.\n\n` +
                `Activá el Autopiloto en Ajustes cuando quieras ✨`);
          } catch (e) {}
          console.log(`[autopilot] usuario ${req.session.userId} desbloqueó la oferta (${u.clean_approvals} aprobaciones limpias)`);
        }
      } catch (e) {
        console.error('[autopilot] no pude contar aprobación limpia:', e.message);
      }
    }
    if (edited) recordSignal(req.session.userId, post, 'edited'); // tocó el texto antes de que salga
  }
  res.json({ ok: true });
});

// POST /api/posts/:id/reject-reason  body {reason}
// El cliente cuenta QUÉ no le gustó de un borrador: se guarda la señal +
// una regla NEGATIVA en style_rules (entra al prompt sola vía Track D).
const REJECT_REASONS = {
  generico: 'NUNCA: diseños genéricos de stock — siempre escena concreta y específica del negocio, nunca banco de imágenes',
  estilo: 'NUNCA: desviarse de la línea visual del cliente definida en LÍNEA VISUAL DEL CLIENTE',
  avatar: 'NUNCA: deformar, redibujar ni reinterpretar el logo de tu marca — debe salir idéntico a la referencia',
  representa: 'NUNCA: contenido que no parezca del negocio real del cliente (su local, sus productos, su gente)',
};
app.post('/api/posts/:id/reject-reason', requireAuth, express.json(), (req, res) => {
  try {
    const reason = String(((req.body || {}).reason) || '').trim();
    if (!REJECT_REASONS[reason]) return res.status(400).json({ ok: false, error: 'Motivo inválido' });
    const uid = req.session.userId;
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, uid);
    if (!post) return res.status(404).json({ ok: false, error: 'No encontrado' });
    const rule = REJECT_REASONS[reason];
    try { recordSignal(uid, post, 'rejected'); } catch (e) {}
    try {
      db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 1)
        ON CONFLICT(user_id, rule_key) DO UPDATE SET rule_text=excluded.rule_text, active=1, hits=hits+1`)
        .run(uid, 'neg:' + reason, rule);
    } catch (e) { return res.status(500).json({ ok: false, error: 'db' }); }
    res.json({ ok: true, rule });
  } catch (e) {
    console.error('[reject-reason]:', e.message);
    res.status(500).json({ ok: false, error: 'No pude guardar tu motivo 😅' });
  }
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (post) recordSignal(req.session.userId, post, 'rejected'); // lo eliminó = no le gustó
  const wasDraft = post && post.status === 'draft';
  db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  // Track 4 (agregado): si borrando uno por uno llegó a cero borradores de esa
  // semana, se dispara la reconstrucción con otro enfoque (igual que Vaciar).
  // Vale para la semana corriente y para la N+1 si la estaba revisando.
  let rebuild = null;
  if (wasDraft) {
    try {
      const tz = userTz(req.session.userId);
      const curWk = mondayKeyOf(tzToday(tz));
      const dwk = post.week_key || curWk; // semana del borrador borrado
      let left;
      if (dwk === curWk) {
        left = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=0 AND (week_key = '' OR week_key = ?)`).get(req.session.userId, curWk).n || 0;
      } else {
        left = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=0 AND week_key = ?`).get(req.session.userId, dwk).n || 0;
      }
      if (left === 0) rebuild = maybeStartRebuild(req.session.userId, dwk);
    } catch (e) { /* no bloquea el borrado */ }
  }
  res.json({ ok: true, rebuild });
});

// Track 4 (agregado): "🗑️ Vaciar" reconstruye la semana con OTRO enfoque.
// Borra todos los borradores de la semana marcándolos como rejected en bulk
// (la exclusión de 60 días del Track D hace que la nueva tanda use otros
// ángulos/tipos) y dispara la generación en segundo plano. Tope: 2 por semana;
// a la 3ª frena y deriva al chat (modo frustración).
app.post('/api/posts/rebuild-week', requireAuth, requireTrialValid, async (req, res) => {
  const uid = req.session.userId;
  const tz = userTz(uid);
  const curWk = mondayKeyOf(tzToday(tz));
  // Semana a reconstruir: la corriente, o la que el frontend esté mostrando
  // (teaser de la N+1). Formato validado: no se acepta cualquier string.
  let wk = curWk;
  const qwk = String(((req.body || {}).week_key) || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(qwk)) wk = qwk;
  const drafts = wk === curWk
    ? db.prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=0 AND (week_key = '' OR week_key = ?) ORDER BY id ASC`).all(uid, curWk)
    : db.prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=0 AND week_key = ? ORDER BY id ASC`).all(uid, wk);
  if (!drafts.length) return res.status(400).json({ error: 'No hay borradores para reconstruir' });
  try {
    vaciarYMarcar(uid, drafts, wk);
  } catch (e) {
    console.error('[rebuild-week] vaciar:', e.message);
    return res.status(500).json({ error: 'No se pudieron borrar los borradores. Probá de nuevo.' });
  }
  const r = maybeStartRebuild(uid, wk);
  console.log(`[rebuild-week] usuario ${uid} semana ${wk}: ${drafts.length} borradores vaciados → rebuilding=${r.rebuilding} (${r.reason || 'ok'})`);
  res.json({ ok: true, emptied: drafts.length, week_key: wk, ...r });
});

// POST /api/week/ensure — garantiza que la semana actual tenga sus posteos.
// Idempotente por usuario: si ya hay borradores/programados de la semana,
// no hace nada. Si está vacío, dispara generateWeekDrafts en segundo plano
// y devuelve { generating: true }. El frontend lo llama al abrir el home
// (sin bloquear la UI) y refresca hasta que aparecen las tarjetas.
// (2026-10-05: pedido de Valentino — los 5 posteos tienen que estar listos
// al entrar a la app, sin comandos ni recargas.)
app.post('/api/week/ensure', requireAuth, requireTrialValid, async (req, res) => {
  const uid = req.session.userId;
  try {
    const tz = userTz(uid);
    const wk = mondayKeyOf(tzToday(tz));
    // 2026-10-07: el fundador nunca debería tener needs_review=1 (sus posteos
    // se ocultaban y el /api/posts los filtraba — causa raíz del "armando tu
    // semana" eterno). Liberar PRIMERO, antes de contar.
    try {
      let isFounder = false;
      try { isFounder = !!(costs.isFounderEmail && costs.isFounderEmail(uid)); } catch (e) {}
      if (isFounder) {
        const r = db.prepare(`UPDATE posts SET needs_review = 0 WHERE user_id = ? AND COALESCE(needs_review, 0) = 1 AND status IN ('draft','scheduled')`).run(uid);
        if (r.changes > 0) console.log(`[week-ensure] fundador ${uid}: ${r.changes} posteos liberados de revisión`);
      }
    } catch (e) { console.error('[week-ensure] liberar revisión:', e.message); }
    // ¿Ya hay trabajo de esta semana? (borradores o programados, no cancelados)
    // Solo contar los VISIBLES (needs_review=0), que son los que ve el frontend.
    let n = 0;
    try {
      n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ? AND status IN ('draft','scheduled') AND COALESCE(needs_review,0)=0`).get(uid, wk).n || 0;
    } catch (e) { /* DB sin week_key: seguir */ }
    // Fallback: borradores sin week_key (pipeline viejo) también cuentan.
    if (!n) {
      try {
        n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft' AND (week_key = '' OR week_key IS NULL) AND COALESCE(needs_review,0)=0`).get(uid).n || 0;
      } catch (e) {}
    }
    if (n > 0) return res.json({ ok: true, generating: false, count: n, week_key: wk });
    // ¿Ya hay una generación en curso? No duplicar.
    if (nextweekRunningFresh(uid)) return res.json({ ok: true, generating: true, count: 0, week_key: wk });
    if (!planOrTrialOk(uid)) return res.json({ ok: false, generating: false, reason: 'no_plan', week_key: wk });
    // Gate de ADN "no generar a ciegas" (MISMA lógica que generateWeekDrafts):
    // si la cuenta no tiene descripción del negocio ni producto_estrella, no
    // disparar nada y avisar al frontend con reason:'no_dna' para que muestre
    // la tarjeta honesta en vez del spinner de "armando tu semana" (que nunca
    // terminaría porque el pipeline descarta la generación en silencio).
    try {
      const profile = getProfile(uid);
      const dna = readDna(uid);
      const descOk = (profile.description || '').trim().length >= 20;
      const dnaOk = (dna.producto_estrella || '').trim().length >= 3;
      if (!descOk && !dnaOk) {
        console.log(`[week-ensure] usuario ${uid}: sin ADN mínimo, no se genera a ciegas`);
        return res.json({ ok: true, generating: false, reason: 'no_dna', week_key: wk });
      }
    } catch (e) { /* si falla el chequeo, dejar que el pipeline decida */ }
    // Disparar en segundo plano: la respuesta vuelve al toque.
    generateWeekDrafts(uid, { weekKey: wk, tag: 'ensure', quiet: false })
      .then(r => console.log(`[week-ensure] usuario ${uid} semana ${wk}:`, r.ok ? `${r.created} creados` : `falló (${r.reason})`))
      .catch(e => console.error('[week-ensure] pipeline:', e.message));
    return res.json({ ok: true, generating: true, count: 0, week_key: wk });
  } catch (e) {
    console.error('[week-ensure]:', e.message);
    return res.status(500).json({ ok: false, error: 'No se pudo verificar la semana.' });
  }
});

// Fix auditoría #2 (2026-09-30): "⚡ Rearmar mi semana" del welcome honesto.
// La importación de /prueba trajo 0 (cache vencido / payload roto, marcado en
// users.trial_import_n): se genera la semana de nuevo en segundo plano con el
// perfil que ya quedó aplicado al registrarse. Responde al toque; el push
// "Tu semana está lista ✨" avisa cuando los borradores aparecen.
app.post('/api/trial/rebuild-import', requireAuth, requireTrialValid, (req, res) => {
  const uid = req.session.userId;
  try {
    const u = db.prepare('SELECT trial_import_n FROM users WHERE id = ?').get(uid) || {};
    if (u.trial_import_n !== 0) return res.json({ ok: true, rebuilding: false, reason: 'not_needed' });
    const drafts = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft'`).get(uid).n || 0;
    if (drafts > 0) return res.json({ ok: true, rebuilding: false, reason: 'has_drafts' });
    const r = maybeStartRebuild(uid);
    console.log(`[trial-rebuild] usuario ${uid}: rebuilding=${r.rebuilding} (${r.reason || 'ok'})`);
    return res.json({ ok: true, rebuilding: !!r.rebuilding, reason: r.reason || null });
  } catch (e) {
    console.error('[trial-rebuild]:', e.message);
    return res.status(500).json({ error: 'No pude arrancar la regeneración 😅 Probá de nuevo.' });
  }
});

// Estado de un posteo (para el seguimiento en vivo de "Publicar ahora")
app.get('/api/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare(
    "SELECT * FROM posts WHERE id = ? AND user_id = ? AND COALESCE(needs_review,0)=0"
  ).get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  res.json({ ok: true, post });
});

// Descartar un posteo fallido: lo saca de la tarjeta de fallidos sin publicarlo.
// Idempotente: si ya está cancelado/descartado, no hace nada.
app.post('/api/posts/:id/dismiss-failed', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (post.status === 'cancelled') return res.json({ ok: true, status: 'cancelled' });
  if (post.status !== 'failed') {
    return res.status(409).json({ error: 'not_failed', message: 'Este posteo no está fallido.' });
  }
  db.prepare(`UPDATE posts SET status = 'cancelled', error = '' WHERE id = ?`).run(post.id);
  console.log(`[posta] Post #${post.id} fallido descartado por el cliente`);
  res.json({ ok: true, status: 'cancelled' });
});

// Publicar AHORA de forma inmediata: no espera al scheduler.
// Idempotente: si ya se está publicando o ya salió, no lo duplica.
app.post('/api/posts/:id/publish-now', requireAuth, requireTrialValid, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (post.status === 'publishing') return res.json({ ok: true, status: 'publishing' });
  if (post.status === 'published') return res.json({ ok: true, status: 'published', permalink: post.ig_permalink });
  if (!['draft', 'scheduled', 'failed'].includes(post.status)) {
    return res.status(400).json({ error: 'Este posteo no se puede publicar ahora' });
  }
  if (post.needs_review) return res.status(403).json({ error: 'in_review', message: 'Este posteo está en revisión ✨ Te aviso cuando esté listo.' });
  // Publicar ahora SÍ consume cupo (salvo que ya estuviera programado: ya se descontó).
  if (!['scheduled', 'publishing', 'published'].includes(post.status)) {
    const q = quotaFor(req.session.userId, post.media_type);
    if (q.left <= 0) {
      return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: q.limit, plan_name: q.plan_name,
        message: `Llegaste al límite de tu plan ${q.plan_name} (${q.limit} ${quotaUnitName(post.media_type)} por semana). Mejorá tu paquete para seguir posteando esta semana.` });
    }
  }
  db.prepare(`UPDATE posts SET status='publishing', scheduled_at=datetime('now'), error='' WHERE id=?`).run(post.id);
  ensureImageBaseUrl(db, req.session.userId, req);
  // La publicación corre en segundo plano; el frontend consulta GET /api/posts/:id
  publishSinglePost(db, { ...post, status: 'publishing' }).catch((e) => console.error('[posta] publish-now:', e.message));
  res.json({ ok: true, status: 'publishing' });
});

// ---------- "Posty te avisa": aprobación de posteos por notificación ----------
// Mini-página HTML para los enlaces de aprobar/rechazar (se abren desde la
// notificación o el email, sin necesidad de sesión).
function approvalPage(title, message) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${esc(title)} · Posty</title></head>` +
    '<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#fff;color:#111">' +
    '<main style="text-align:center;padding:24px;max-width:420px">' +
    `<h1 style="font-size:24px;margin:0 0 12px">${esc(title)}</h1>` +
    `<p style="font-size:17px;color:#444;margin:0">${esc(message)}</p>` +
    '</main></body></html>';
}

// Auth de aprobación: sesión (el post debe pertenecer al usuario de la sesión)
// O firma válida (?sig=&exp=, verifyAction). Con firma válida, el user_id del
// post manda y no hace falta sesión. Sin ninguna de las dos → 403.
function approvalAuth(action) {
  return (req, res, next) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    const deny = (title, msg) => req.method === 'GET'
      ? res.status(403).send(approvalPage(title, msg))
      : res.status(403).json({ error: 'forbidden', message: msg });
    if (!post) {
      return req.method === 'GET'
        ? res.status(404).send(approvalPage('Posteo no encontrado', 'Este enlace no corresponde a ningún posteo.'))
        : res.status(404).json({ error: 'Post no encontrado' });
    }
    const sessionUid = req.session && req.session.userId;
    if (sessionUid) {
      if (post.user_id !== sessionUid) return deny('Sin permiso', 'Este posteo no es de tu cuenta.');
      req.approvalPost = post;
      return next();
    }
    const { sig, exp } = req.query || {};
    if (sig && exp && approval.verifyAction(post.id, action, sig, exp)) {
      req.approvalPost = post;
      return next();
    }
    return deny('Enlace vencido', 'Este enlace de aprobación venció o no es válido. Entrá a Posty para ver tu posteo.');
  };
}

app.post('/api/posts/:id/approve', approvalAuth('approve'), (req, res) => {
  const post = req.approvalPost;
  if (post.approval === 'rejected') {
    return res.status(409).json({ error: 'rejected', message: 'Este posteo fue rechazado: ya no se puede aprobar.' });
  }
  if (post.approval === 'approved' || post.approval === 'auto') {
    return res.json({ ok: true, approval: post.approval }); // idempotente
  }
  db.prepare(`UPDATE posts SET approval = 'approved', approved_at = datetime('now') WHERE id = ?`).run(post.id);
  res.json({ ok: true, approval: 'approved' });
});

app.get('/api/posts/:id/approve', approvalAuth('approve'), (req, res) => {
  const post = req.approvalPost;
  if (post.approval === 'rejected') {
    return res.status(409).send(approvalPage('Ya fue rechazado', 'Este posteo fue cancelado: ya no se puede aprobar.'));
  }
  if (post.approval !== 'approved' && post.approval !== 'auto') {
    db.prepare(`UPDATE posts SET approval = 'approved', approved_at = datetime('now') WHERE id = ?`).run(post.id);
  }
  const label = approval.userHourLabel(db, post.user_id, post.scheduled_at);
  res.send(approvalPage('✅ ¡Aprobado!', `Tu posteo sale a las ${label || 'la hora programada'}.`));
});

// FASE 2 — lógica compartida de "aceptar borradores": los marca approved +
// scheduled en su horario. items = [{ id, scheduled_at? }].
// opts.includeNeedsReview=true incluye borradores con needs_review=1: el
// preview del email de semana YA fue la revisión humana, y el tap firmado ES
// la aprobación (default false = solo borradores ya revisados, comportamiento
// histórico del accept-all in-app).
// Con quota checks: todos de una o nada (mismo criterio que schedule-all).
// El tap cuenta como aprobación del usuario (recordSignal), NO como
// auto_published del sistema: suma a la escalera de confianza de Fase 1.
function acceptAllDrafts(uid, items, opts) {
  const list = Array.isArray(items) ? items : [];
  const ids = [...new Set(list.map((it) => Number(it && it.id)).filter((n) => n > 0))];
  if (!ids.length) return { ok: false, reason: 'empty' };
  const whenById = {};
  for (const it of list) {
    const n = Number(it && it.id);
    if (n > 0 && it.scheduled_at) {
      const d = new Date(String(it.scheduled_at));
      if (!isNaN(d)) whenById[n] = d.toISOString().slice(0, 19).replace('T', ' ');
    }
  }
  const ph = ids.map(() => '?').join(',');
  const drafts = db.prepare(
    `SELECT * FROM posts WHERE id IN (${ph}) AND user_id = ? AND status = 'draft'`
  ).all(...ids, uid);
  const pool = (opts && opts.includeNeedsReview)
    ? drafts
    : drafts.filter((d) => (d.needs_review || 0) === 0);
  // Solo pendientes: respeta rechazados (no se tocan) y omite los ya aprobados.
  const pending = pool.filter((d) => (d.approval || 'pending') === 'pending');
  if (!pending.length) return { ok: false, reason: 'no_pending' };
  // Cupo: todos de una o nada (mismo criterio que /api/posts/schedule-all).
  const qf = quotaFor(uid, 'image');
  const qr = quotaFor(uid, 'video');
  const qs = quotaFor(uid, 'story');
  const feedBillable = pending.filter((d) => d.media_type !== 'story' && d.media_type !== 'video').length;
  const reelBillable = pending.filter((d) => d.media_type === 'video').length;
  const storyBillable = pending.filter((d) => d.media_type === 'story').length;
  if (feedBillable > qf.left || reelBillable > qr.left || storyBillable > qs.left) {
    return { ok: false, reason: 'plan_limit', quota: qf };
  }
  const upd = db.prepare(`UPDATE posts SET approval='approved', approved_at=datetime('now'), status='scheduled', scheduled_at=?, needs_review=0, error='' WHERE id=?`);
  let n = 0;
  for (const d of pending) {
    const when = whenById[d.id] || (d.scheduled_at ? String(d.scheduled_at).slice(0, 19).replace('T', ' ') : null);
    if (!when) continue; // sin hora no se puede programar: se saltea
    upd.run(when, d.id);
    try { recordSignal(uid, d, 'approved'); } catch (e) {}
    n++;
  }
  try { track(uid, 'accept_all', String(n)); } catch (e) {}
  return { ok: true, accepted: n };
}

// POST /api/posts/accept-all — "✅ Aceptar todos" (tarjeta "Revisá tu semana").
// Todos los borradores pendientes del usuario pasan a aprobados + programados en
// la hora indicada (la que muestra la tarjeta de revisión). Respeta rechazados:
// no los toca. El tap ES la confirmación (sin diálogo redundante).
app.post('/api/posts/accept-all', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
  const r = acceptAllDrafts(uid, items);
  if (r.reason === 'empty') return res.status(400).json({ error: 'Sin posteos para aceptar' });
  if (r.reason === 'no_pending') return res.status(400).json({ error: 'No hay borradores pendientes' });
  if (r.reason === 'plan_limit') {
    const qf = r.quota;
    return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: qf.limit, plan_name: qf.plan_name,
      message: `Llegaste al límite de tu plan ${qf.plan_name}. Mejorá tu paquete para seguir posteando esta semana.` });
  }
  res.json({ ok: true, accepted: r.accepted });
});

// FASE 2 — GET /api/week/:weekKey/publish — "Publicar semana" de un tap, SIN
// login. Es el botón del email de preview (sendWeekPreview): la firma HMAC ata
// (userId, weekKey, exp) y el tap ES la revisión humana (includeNeedsReview).
// Idempotente: si ya no hay borradores, confirma igual.
app.get('/api/week/:weekKey/publish', (req, res) => {
  const weekKey = String(req.params.weekKey || '');
  const uid = Number(req.query.uid);
  const { sig, exp } = req.query || {};
  const bad = (code, title, msg) => res.status(code).send(approvalPage(title, msg));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return bad(404, 'Enlace inválido', 'Este enlace no corresponde a ninguna semana.');
  if (!uid || !(sig && exp)) return bad(403, 'Enlace inválido', 'A este enlace le faltan datos. Pedí uno nuevo desde tu email de Posty.');
  if (!approval.verifyWeekAction(uid, weekKey, sig, exp)) return bad(403, 'Enlace vencido', 'Este enlace venció o no es válido. Entrá a Posty para publicar tu semana.');
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!u) return bad(404, 'Cuenta no encontrada', 'Este enlace no corresponde a una cuenta válida.');
  const drafts = db.prepare(`SELECT id, scheduled_at FROM posts
    WHERE user_id = ? AND week_key = ? AND status = 'draft'
      AND media_type IN ('image','carousel','video')
    ORDER BY created_at ASC`).all(uid, weekKey);
  if (!drafts.length) return res.send(approvalPage('✅ Semana publicada', 'Tu semana ya está publicada o programada. ¡A seguir vendiendo! 🚀'));
  // Horarios propuestos: el preview los deja puestos; si faltan (email viejo),
  // se asignan acá con la misma política del autopilot.
  let slots = new Map();
  try {
    const missing = drafts.filter((d) => !d.scheduled_at);
    if (missing.length) slots = assignScheduleSlots(uid, missing);
  } catch (e) { console.error('[week publish] slots:', e.message); }
  const items = drafts.map((d) => ({ id: d.id, scheduled_at: d.scheduled_at || slots.get(d.id) || null }));
  const r = acceptAllDrafts(uid, items, { includeNeedsReview: true });
  if (r.reason === 'plan_limit') {
    const qf = r.quota || {};
    return bad(403, 'Límite del plan', `Tu plan ${qf.plan_name || ''} no alcanza para publicar toda la semana de una. Mejorá tu paquete y volvé a tocar el botón.`);
  }
  if (!r.ok || !r.accepted) return res.send(approvalPage('Nada para publicar', 'No había borradores pendientes en esta semana.'));
  return res.send(approvalPage('✅ ¡Semana publicada!', `${r.accepted} ${r.accepted === 1 ? 'posteo programado' : 'posteos programados'}. Posty se encarga del resto 🚀`));
});

app.post('/api/posts/:id/reject', approvalAuth('reject'), (req, res) => {
  const post = req.approvalPost;
  if (post.approval === 'rejected' || post.status === 'cancelled') {
    return res.json({ ok: true, approval: 'rejected' }); // idempotente
  }
  if (post.status === 'published') {
    return res.status(409).json({ error: 'already_published', message: 'Este posteo ya salió: no se puede cancelar.' });
  }
  if (!['pending', 'approved'].includes(post.approval || 'pending') || post.status !== 'scheduled') {
    return res.status(409).json({ error: 'not_rejectable', message: 'Este posteo ya no se puede cancelar.' });
  }
  db.prepare(`UPDATE posts SET approval = 'rejected', status = 'cancelled', error = '' WHERE id = ?`).run(post.id);
  try { recordSignal(post.user_id, post, 'rejected'); } catch (e) {} // FASE 5: el veto en el pre-aviso es señal fuerte
  console.log(`[posta] Post #${post.id} rechazado por el cliente → cancelado`);
  res.json({ ok: true, approval: 'rejected' });
});

app.get('/api/posts/:id/reject', approvalAuth('reject'), (req, res) => {
  const post = req.approvalPost;
  if (post.approval === 'rejected' || post.status === 'cancelled') {
    return res.send(approvalPage('Ya estaba cancelado', 'Este posteo ya estaba cancelado: no se va a publicar.'));
  }
  if (post.status === 'published') {
    return res.status(409).send(approvalPage('Ya salió', 'Este posteo ya se publicó: no se puede cancelar.'));
  }
  if (!['pending', 'approved'].includes(post.approval || 'pending') || post.status !== 'scheduled') {
    return res.status(409).send(approvalPage('No se puede cancelar', 'Este posteo ya no está programado.'));
  }
  db.prepare(`UPDATE posts SET approval = 'rejected', status = 'cancelled', error = '' WHERE id = ?`).run(post.id);
  try { recordSignal(post.user_id, post, 'rejected'); } catch (e) {} // FASE 5: el veto en el pre-aviso es señal fuerte
  console.log(`[posta] Post #${post.id} rechazado por el cliente → cancelado`);
  res.send(approvalPage('Posteo cancelado', 'Listo: este posteo no se va a publicar.'));
});

// Duplicar un posteo como borrador (para re-publicarlo sin armarlo de cero)
app.post('/api/posts/:id/duplicate', requireAuth, requireTrialValid, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  // Duplicar crea un borrador: los borradores no consumen cupo (se descuenta al programar/publicar).
  const r = db.prepare(
    'INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review) VALUES (?,?,?,?,?,?,?,?)'
  ).run(req.session.userId, post.image_path, post.caption, post.hashtags, null, 'draft', post.media_type || 'image', trainingWheelsActive(req.session.userId) ? 1 : 0);
  res.json({ ok: true, id: r.lastInsertRowid });
});

// "🔄 Otras 3": 3 variantes frescas (imagen con IA + texto) del MISMO borrador,
// cada una con otro ángulo de ejecución. No crea posteos ni consume cupo: solo
// genera imágenes temporales que el usuario puede elegir (PATCH) o ignorar.
// El borrador original queda intacto si la generación falla.
app.post('/api/posts/:id/variants', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  const uid = req.session.userId;
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  if (post.media_type === 'video' || post.media_type === 'carousel')
    return res.status(400).json({ error: 'Las variantes van solo en posteos con imagen 🖼️' });
  try {
    const settings = getSettings(uid);
    const key = settings.openai_key || process.env.OPENAI_API_KEY || '';
    if (!key) return res.status(400).json({ error: 'Sin clave de OpenAI' });
    const profile = getProfile(uid);
    const topic = (post.source_topic || '').trim()
      || String(post.caption || '').split('\n')[0].trim().slice(0, 80)
      || 'novedad';
    const tipo = post.tipo || '';
    const dna = readDna(uid);
    let styleRules = [];
    try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(uid).map(r => r.rule_text); } catch (e) {}
    let voice = '';
    try { if (typeof voiceExamples === 'function') voice = voiceExamples(db, uid) || ''; } catch (e) {}
    const refs = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY created_at DESC LIMIT 2`)
      .all(uid).map(r => r.file_path).filter(Boolean);
    const baseInput = {
      business: profile.business_name,
      category: profile.category,
      description: profile.description,
      dna,
      tone: profile.tone,
      topic,
      tipo,
      competitors: profile.competitors,
      goal: profile.goal,
      taste: tasteProfile(uid),
      performance: [performanceBrief(db, uid), bestHoursLine(db, uid)].filter(Boolean).join('\n'),
      styleRules,
      voice,
      golden: goldenExamples(uid), // "rueditas": posteos aprobados como few-shot
    };
    // 3 ángulos distintos para que las variantes no se parezcan entre sí.
    const angles = [
      'Enfocá el ángulo del BENEFICIO directo: qué gana el cliente con esto.',
      'Enfocá el ángulo de la NOVEDAD y la curiosidad: algo que la gente no espera.',
      'Enfocá el ángulo de la CONFIANZA: cercanía, equipo, clientes que ya lo eligen.',
    ];
    const results = await Promise.allSettled([0, 1, 2].map(async (i) => {
      const out = await generateCaptions({ ...baseInput, feedback: angles[i], seedBase: i * 7 + 1 }, 1, key);
      const caption = (out.captions && out.captions[0]) || '';
      if (!caption.trim()) throw new Error('La IA no devolvió texto');
      // Titular corto y COMPLETO para la imagen (makeHeadline: jamás cortado a mitad de oración).
      const headline = makeHeadline(String(caption).split('\n')[0], 6);
      const imagePath = await conceptShotGenerateQueued({
        uid, idea: { titulo: topic, porque: angles[i] }, tipo, headline, refs, apiKey: key,
      });
      return { image_path: imagePath, caption, hashtags: out.hashtags || '' };
    }));
    const variants = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    results.filter(r => r.status === 'rejected').forEach(r => console.error('[variants] variante falló:', r.reason && r.reason.message));
    if (!variants.length)
      return res.status(502).json({ error: 'Las variantes no me salieron 😅 Probá de nuevo en un minuto' });
    console.log(`[variants] borrador ${post.id}: ${variants.length}/3 variantes para usuario ${uid}`);
    res.json({ ok: true, variants });
  } catch (e) {
    console.error('[variants]', e.message);
    res.status(500).json({ error: 'No se pudieron generar las variantes: ' + e.message.slice(0, 200) });
  }
});
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
// UTC ISO → "AAAA-MM-DD HH:MM" en la zona del cliente (para la agenda que ve el chat).
function wallInTz(iso, tz) {
  if (!iso) return '';
  try {
    const s = String(iso);
    const d = new Date(s.length === 16 ? s : s.replace(' ', 'T'));
    if (isNaN(d)) return '';
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
    const hh = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}`;
  } catch { return ''; }
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
  // Track 4: si el posteo trae week_key explícita (pipeline perpetuo), manda ella.
  if (p.week_key) return p.week_key;
  return mondayKeyOf(ymdInTz(p.scheduled_at || p.published_at || p.created_at, tz) || tzToday(tz));
}
// Guarda (o actualiza) la señal del cliente para un posteo. La última señal vale.
// Perfil de gusto del cliente a partir de sus 👍/👎: se inyecta en el prompt para que la IA aprenda de verdad.
function tasteProfile(userId) {
  try {
    // FASE 5: las señales manuales pesan primero; las auto-marcadas por el
    // scheduler (auto_signal=1) van después para no diluir el taste.
    const rows = db.prepare(`
      SELECT s.caption AS caption, s.client_signal AS sig FROM post_signals s
      WHERE s.user_id = ? AND s.client_signal IN ('approved','rejected')
      ORDER BY COALESCE(s.auto_signal, 0) ASC, s.updated_at DESC LIMIT 12
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
// ===== Track D — Auditoría del loop de aprendizaje =====
// Antes de este fix: los temas rechazados NO se excluían (la IA los repetía),
// los aprobados NO se priorizaban explícitamente, y brought_clients/no_clients
// se guardaban pero NADIE los leía (señal MUERTA). Estas 3 funciones las reviven.
// Temas RECHAZADOS por el cliente (últimos 60 días) → se excluyen de la próxima tanda.
function excludedTopicsLine(userId) {
  try {
    const rows = db.prepare(`
      SELECT s.caption AS caption FROM post_signals s
      WHERE s.user_id = ? AND s.client_signal IN ('rejected', 'rating_1', 'rating_2')
        AND s.updated_at >= datetime('now', '-60 days')
      ORDER BY s.updated_at DESC LIMIT 12
    `).all(userId);
    const temas = rows.map(r => String(r.caption || '').split('\n')[0].slice(0, 80).trim())
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return temas.length ? temas.join(' | ') : '';
  } catch (e) { return ''; }
}
// Temas y tipos APROBADOS/EDITADOS (últimos 60 días) → se priorizan con variación.
function approvedTopicsLine(userId) {
  try {
    const rows = db.prepare(`
      SELECT s.caption AS caption, p.tipo AS tipo FROM post_signals s
      LEFT JOIN posts p ON p.id = s.post_id
      WHERE s.user_id = ? AND s.client_signal IN ('approved', 'edited', 'rating_4', 'rating_5')
        AND s.updated_at >= datetime('now', '-60 days')
      ORDER BY COALESCE(s.auto_signal, 0) ASC, s.updated_at DESC LIMIT 12
    `).all(userId);
    const temas = rows.map(r => String(r.caption || '').split('\n')[0].slice(0, 80).trim())
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
    const tipos = [...new Set(rows.map(r => String(r.tipo || '').trim()).filter(t => TIPOS_VALIDOS.includes(t)))].slice(0, 3);
    let t = '';
    if (temas.length) t += temas.join(' | ');
    if (tipos.length) t += (t ? '; ' : '') + `tipos que le gustaron: ${tipos.join(', ')}`;
    return t;
  } catch (e) { return ''; }
}
// Brief de outcome: temas que trajeron CLIENTES de verdad (repetir con variación)
// vs los que no trajeron (evitar). Entran al prompt de ideas y al chat.
function outcomeBrief(userId) {
  try {
    const rows = db.prepare(`
      SELECT s.caption AS caption, s.client_signal AS sig FROM post_signals s
      WHERE s.user_id = ? AND s.client_signal IN ('brought_clients', 'no_clients')
      ORDER BY s.updated_at DESC LIMIT 12
    `).all(userId);
    const si = [], no = [];
    for (const r of rows) {
      const cap = String(r.caption || '').split('\n')[0].slice(0, 80).trim();
      if (!cap) continue;
      if (r.sig === 'brought_clients' && si.length < 4 && !si.includes(cap)) si.push(cap);
      else if (r.sig === 'no_clients' && no.length < 4 && !no.includes(cap)) no.push(cap);
    }
    let t = '';
    if (si.length) t += `\nTemas que le trajeron CLIENTES de verdad (repetilos con una variación o un ángulo nuevo, no copies el posteo):\n- ${si.join('\n- ')}`;
    if (no.length) t += `\nTemas que NO le trajeron clientes (evitalos o cambialos de raíz):\n- ${no.join('\n- ')}`;
    return t;
  } catch (e) { return ''; }
}
// ===== FASE 5 (2026-10-05) — aprendizaje AUTOMÁTICO de contenido =====
// Bajo autopilot el taste manual (👍/👎) se seca: este bloque lo reemplaza con
// ER medido por tipo de contenido, y se inyecta en generateIdeas igual que
// tasteProfile. Lee post_metrics (ingesta de insights) con fallback a las
// columnas ig_* de posts; sin datos reales devuelve '' (fail-safe: sin App
// Review no hay métricas y el prompt queda intacto).
// Suavizado bayesiano con la fórmula documentada de learning.js, pero con
// prior = el promedio del PROPIO cliente (no el global): 1 posteo viral no
// domina. Solo habla con evidencia (>=2 posteos medidos por tipo, >=4 total)
// y cuando algún tipo se desvía de forma significativa de su promedio.
function contentPerformanceLine(userId) {
  try {
    const { engagementRate, C_PRIOR, PRIOR_ER } = require('./learning');
    const C = (typeof C_PRIOR === 'number' && C_PRIOR > 0) ? C_PRIOR : 5;
    const rows = db.prepare(`
      SELECT p.tipo AS tipo,
             SUM(COALESCE(m.reach, p.ig_reach, 0)) AS reach,
             SUM(COALESCE(m.likes, p.ig_likes, 0)) AS likes,
             SUM(COALESCE(m.comments, p.ig_comments, 0)) AS comments,
             SUM(COALESCE(m.saved, 0)) AS saved,
             COUNT(*) AS n
      FROM posts p
      LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.user_id = ?
        AND p.status = 'published'
        AND COALESCE(p.published_at, p.created_at) > datetime('now', '-90 days')
        AND p.tipo IN ('promo','tip','social','detras','novedad')
      GROUP BY p.tipo
    `).all(userId);
    const measured = rows.filter(r => (r.reach + r.likes + r.comments + r.saved) > 0 && r.n >= 2);
    const totalN = measured.reduce((a, r) => a + r.n, 0);
    if (!measured.length || totalN < 4) return '';
    const tot = measured.reduce((a, r) => ({
      reach: a.reach + r.reach, likes: a.likes + r.likes,
      comments: a.comments + r.comments, saved: a.saved + r.saved,
    }), { reach: 0, likes: 0, comments: 0, saved: 0 });
    const mean = engagementRate(tot) || PRIOR_ER;
    const scored = measured.map(r => {
      const er = engagementRate(r);
      const score = (C * mean + r.n * er) / (C + r.n);
      return { tipo: r.tipo, n: r.n, ratio: mean > 0 ? score / mean : 1 };
    }).filter(s => s.ratio >= 1.25 || s.ratio <= 0.75)
      .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))
      .slice(0, 4);
    if (!scored.length) return '';
    const lines = scored.map(s => {
      const x = (Math.round(s.ratio * 10) / 10).toFixed(1).replace(/\.0$/, '');
      return s.ratio >= 1.25
        ? `- Tus posteos tipo "${s.tipo}" rinden ${x}x tu promedio (${s.n} posteos): PRIORIZALOS con variación.`
        : `- Tus posteos tipo "${s.tipo}" rinden ${x}x tu promedio (${s.n} posteos): usalos menos o cambiales el ángulo.`;
    });
    return `\nRENDIMIENTO MEDIDO de tu cuenta (últimos 90 días, datos reales de Instagram):\n${lines.join('\n')}`;
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
        week_key=excluded.week_key, updated_at=datetime('now'),
        auto_signal=0 -- FASE 5: la señal manual pisa la auto-marcada
    `).run(userId, post.id, post.caption || '', post.hashtags || '', post.scheduled_at || '', prof.category || '', signal, wk);
  } catch (e) { console.error('[posta] recordSignal:', e.message); }
}

// Señal manual sobre un posteo (👍/👎 en borradores, estrellitas 1-5 en "Ya salió")
app.post('/api/posts/:id/signal', requireAuth, (req, res) => {
  const { signal } = req.body || {};
  if (!['approved', 'edited', 'rejected', 'brought_clients', 'no_clients', 'rating_1', 'rating_2', 'rating_3', 'rating_4', 'rating_5'].includes(signal)) return res.status(400).json({ error: 'Señal inválida' });
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!post) return res.status(404).json({ error: 'Post no encontrado' });
  recordSignal(req.session.userId, post, signal);
  res.json({ ok: true });
});

// ===== Track 4 "Pipeline perpetuo" =====
// Cuando el usuario programa su semana N (un tap), la semana N+1 se empieza a
// armar SOLA en segundo plano. Al llegar la semana siguiente, los borradores ya
// están listos para revisar y programar. NUNCA se auto-programa N+1: quedan como
// borradores. Sin el tap del usuario, nada se programa ni publica.
// El pipeline es 100% server-side (el autopilot del browser no sirve en
// background): ideas (generateIdeas) + texto (generateContent) + imagen
// (conceptShotGenerate, motor nivel agencia) + INSERT como borrador.
// Límites honestos del MVP server-side: sin canvas (no hay fallback de diseño
// si concept-shot falla: ese borrador se saltea y se sigue) y sin reels
// (autopilotReel vive en el browser; el último borrador sale como imagen y el
// usuario lo puede convertir).
// Guard en memoria (mismo proceso que el cron): una sola corrida por usuario.
const NEXTWEEK_RUNNING = new Map(); // uid -> timestamp de inicio
// Limpia corridas trabadas: si una generación lleva más de 15 min, se asume
// colgada y se libera para reintentar (2026-10-06: fix del "armando tu semana"
// eterno — la corrida anterior de Valentino quedó marcada y nunca se liberó).
function nextweekRunningFresh(uid) {
  const ts = NEXTWEEK_RUNNING.get(uid);
  if (!ts) return false;
  if (Date.now() - ts > 15 * 60 * 1000) {
    NEXTWEEK_RUNNING.delete(uid);
    console.log(`[pipeline] usuario ${uid}: corrida trabada (>15min), liberada para reintentar`);
    return false;
  }
  return true;
}
// Gate 1: solo con plan activo O trial vigente. Cada semana cuesta plata real.
function planOrTrialOk(uid) {
  try {
    const u = db.prepare('SELECT plan_status, trial_ends_at, trial_extended_until, created_at FROM users WHERE id = ?').get(uid);
    return !!(u && (u.plan_status === 'active' || trialEffectiveEnd(u) > Date.now()));
  } catch (e) { return false; }
}
// Gate 2: el usuario estuvo activo en los últimos 7 días.
// Señales (mejor disponible primero): posteos creados (el autopilot crea),
// mensajes de chat, señales del cliente (👍/👎, programados, outcome).
function activeRecently(uid, days) {
  try {
    const r = db.prepare(`
      SELECT 1 FROM posts WHERE user_id = ? AND created_at >= datetime('now', ?)
      UNION ALL SELECT 1 FROM chat_messages WHERE user_id = ? AND created_at >= datetime('now', ?)
      UNION ALL SELECT 1 FROM post_signals WHERE user_id = ? AND updated_at >= datetime('now', ?)
      LIMIT 1`).get(uid, `-${days} days`, uid, `-${days} days`, uid, `-${days} days`);
    return !!r;
  } catch (e) { return false; }
}
// Gate 4: pausa por inactividad — si en 14 días no hubo ni programados nuevos
// ni corridas del autopilot, no se dispara (ni trigger ni cron).
function pipelineAliveRecently(uid) {
  try {
    const r = db.prepare(`
      SELECT 1 FROM posts WHERE user_id = ? AND status IN ('scheduled','publishing','published') AND created_at >= datetime('now', '-14 days')
      UNION ALL SELECT 1 FROM posts WHERE user_id = ? AND status = 'draft' AND created_at >= datetime('now', '-14 days')
      UNION ALL SELECT 1 FROM post_signals WHERE user_id = ? AND client_signal = 'approved' AND updated_at >= datetime('now', '-14 days')
      LIMIT 1`).get(uid, uid, uid);
    return !!r;
  } catch (e) { return false; }
}
// Los 4 gates juntos. Devuelve { ok, reason }.
function nextWeekEligible(uid, weekKey) {
  if (!planOrTrialOk(uid)) return { ok: false, reason: 'no_plan' };
  if (!activeRecently(uid, 7)) return { ok: false, reason: 'inactive_7d' };
  // Gate 3: una sola semana de adelanto — si ya hay posteos (borradores o no)
  // marcados con esa week_key, no regenerar.
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ? AND status != 'cancelled'`).get(uid, weekKey).n || 0;
    if (n > 0) return { ok: false, reason: 'already_exists' };
  } catch (e) { /* sin week_key en DB vieja: seguir */ }
  if (!pipelineAliveRecently(uid)) return { ok: false, reason: 'paused_14d' };
  return { ok: true };
}
// Helpers de marca para portadas de stories/reels (image-fallback.js).
// Logo del cliente como archivo absoluto (o null si no hay).
function logoAbsPath(uid) {
  try {
    const row = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'logo' ORDER BY id ASC LIMIT 1`).get(uid);
    const p = row && path.join(MEDIA_DIR, path.basename(String(row.file_path || '')));
    return (p && fs.existsSync(p)) ? p : null;
  } catch (e) { return null; }
}
// Primer color de marca del cliente (o default Posty).
function primaryBrandHex(uid) {
  try {
    const hexes = parseBrandHexes((getSettings(uid) || {}).brand_colors);
    return (hexes && hexes[0]) || '#0A1E33';
  } catch (e) { return '#0A1E33'; }
}
// Genera los borradores de una semana (week_key = lunes 'YYYY-MM-DD').
// Idempotente por (usuario, semana): si ya existen, no hace nada.
async function generateWeekDrafts(uid, { weekKey, tag, quiet }) {
  // Kill-switch diario también para el pipeline en segundo plano: se aborta en
  // silencio (el usuario lo reintenta mañana; nada se rompe).
  try { costs.assertAiOk(uid); }
  catch (e) { console.error(`[pipeline:${tag}] kill-switch, skip usuario ${uid}`); return { ok: false, reason: 'ai_cap' }; }
  if (nextweekRunningFresh(uid)) { console.log(`[pipeline:${tag}] usuario ${uid}: ya hay una corrida en curso, skip`); return { ok: false, reason: 'running' }; }
  NEXTWEEK_RUNNING.set(uid, Date.now());
  try {
    try {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ? AND status != 'cancelled'`).get(uid, weekKey).n || 0;
      if (n > 0) return { ok: false, reason: 'already_exists' };
    } catch (e) { /* DB sin week_key: seguir */ }
    // Gate de ADN "no generar a ciegas" (mismo umbral que /api/ideas).
    const profile = getProfile(uid);
    const dna = readDna(uid);
    const descOk = (profile.description || '').trim().length >= 20;
    const dnaOk = (dna.producto_estrella || '').trim().length >= 3;
    if (!descOk && !dnaOk) { console.log(`[pipeline:${tag}] usuario ${uid}: sin ADN mínimo, no se genera a ciegas`); return { ok: false, reason: 'no_dna' }; }
    const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(uid) || {};
    const ppw = (getPlan(u.plan_status === 'active' ? u.plan : TRIAL_PLAN).postsPerWeek) || 3;
    const key = openaiKeyFor(uid);
    // Resiliencia (2026-10-05): si la generación de ideas tira (IA caída,
    // saldo 0, input inesperado), NO propagar la excepción al sweep: devolver
    // fallo estructurado para que se registre y se reintente con backoff.
    let ideas;
    try { ideas = await generateIdeas(ideasInputFor(uid), key, { strict: true }); }
    catch (e) { console.error(`[pipeline:${tag}] ideas falló:`, e.message); return { ok: false, reason: 'ai_error', error: e.message }; }
    const picks = ideas.slice(0, ppw);
    if (!picks.length) return { ok: false, reason: 'no_ideas' };
    const dupStmt = db.prepare(`SELECT id FROM posts WHERE user_id = ? AND status != 'cancelled' AND LOWER(TRIM(caption)) = LOWER(?) AND created_at > datetime('now', '-1 day')`);
    const insStmt = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, source_angle, tipo, strategy_why, week_key, needs_review, style_code, style_reason, intent, product_ref, hook_id) VALUES (?,?,?,?, 'draft','image',?,?,?,?,?,?,?,?,?,?,?)`);
    // FASE 1: la escalera de confianza decide la revisión — nivel 0 pasa por
    // revisión humana; nivel ≥1 sale directo (el qualityGate de Fase 0 en
    // scheduleAllDrafts ya filtra lo que no está a la altura).
    // 2026-10-07: el fundador nunca pasa por revisión (sus posteos se
    // ocultaban por needs_review=1 y el /api/posts los filtraba — causa raíz
    // del "armando tu semana" eterno de Valentino).
    let isFounder = false;
    try { isFounder = !!(costs.isFounderEmail && costs.isFounderEmail(uid)); } catch (e) {}
    const needRev = (!isFounder && autopilot.trustLevel(db, uid) === 0) ? 1 : 0;
    let created = 0;
    let imgFailCount = 0; // ideas saltadas por fallo de imagen IA (nunca se crea un bloque plano)
    // Estilos de imagen: un solo tracker por semana para no repetir estilo
    // entre borradores (lo comparten los 3 workers del pool).
    const usedStyles = [];
    // Pool de 3 en paralelo (igual que el autopilot del browser).
    let nextIdx = 0;
    // Carousel automático: como máximo 1 por semana, para la idea más
    // carousel-friendly (tips/educativo). El claim es sincrónico: sin race
    // entre los 3 workers.
    let carouselClaimed = false;
    // Reference lock: la primera foto de producto de la semana (si ya existe)
    // viaja como referencia para que el producto se vea idéntico en todos
    // los posteos. Se resuelve por worker justo antes de generar.
    function weekProductRef() {
      try {
        const r = db.prepare(`SELECT image_path FROM posts WHERE user_id = ? AND week_key = ?
          AND intent = 'producto' AND image_path LIKE '/media/%' AND status != 'cancelled'
          ORDER BY id ASC LIMIT 1`).get(uid, weekKey);
        const p = r && String(r.image_path || '');
        if (p) { try { return fs.existsSync(path.join(MEDIA_DIR, path.basename(p))) ? p : null; } catch (e) { return null; } }
      } catch (e) {}
      return null;
    }
    async function worker() {
      while (true) {
        const i = nextIdx++;
        if (i >= picks.length) return;
        const idea = picks[i];
        let isCarousel = false;
        try {
          const ri = resolveExplicitIntent({ tipo: idea.tipo || '', theme: idea.titulo || '', angle: idea.angulo || idea.porque || '' });
          if (!carouselClaimed && (ri.intent === 'tips' || ri.intent === 'educativo')) { carouselClaimed = true; isCarousel = true; }
        } catch (e) {}
        try {
          const content = await generateContent(contentInputFor(uid, idea.titulo, idea.tipo, i), key);
          const caption = String((content && content.caption) || '').trim();
          const hashtags = String((content && content.hashtags) || '');
          if (!caption) throw new Error('caption vacío');
          recordHookUse(uid, content && content.hookId); // hook engine: rotación 8 semanas
          // Anti-duplicados 24h (mismo criterio que POST /api/posts).
          if (dupStmt.get(uid, caption)) { console.log(`[pipeline:${tag}] duplicado 24h, skip: ${idea.titulo}`); continue; }
          // Titular COMPLETO para la imagen (makeHeadline: jamás cortado a mitad de oración).
          const headline = makeHeadline(caption.split('\n')[0], 6)
            || makeHeadline(idea.titulo, 5);
          let refs = [];
          try { refs = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY created_at DESC LIMIT 2`).all(uid).map(r => r.file_path); } catch (e) {}
          // INVARIANTE: todo borrador sale con imagen real de IA, nunca solo
          // palabras y nunca un bloque plano. Si la IA falla tras los
          // reintentos, la idea se salta (no se crea el borrador).
          const styleOut = {};
          let imagePath = null;
          let carouselGen = null;
          // Reference lock: la primera foto de producto de la semana viaja como
          // referencia para que el producto se vea idéntico en todos los posteos.
          const productRef = weekProductRef();
          if (isCarousel) {
            // Carousel automático: portada scroll-stop + 3 placas IA.
            try {
              carouselGen = await generateCarouselSet({
                uid, idea: { titulo: idea.titulo, porque: idea.porque || idea.angulo },
                tipo: idea.tipo, caption, key, usedStyles,
              });
              console.log(`[pipeline:${tag}] carousel para "${idea.titulo || i}": ${carouselGen.slidePaths.length} placas`);
            } catch (e) {
              console.error(`[pipeline:${tag}] carousel falló, caigo a imagen simple:`, e.message);
              carouselGen = null; isCarousel = false;
            }
          }
          if (!isCarousel) {
          // Reintentos de imagen IA (2026-10-06, Valentino): un bloque plano
          // NUNCA se muestra como posteo terminado. Hasta 3 intentos con
          // backoff corto antes de saltar la idea.
          for (let attempt = 0; attempt < 3 && !imagePath; attempt++) {
          try {
            imagePath = await conceptShotGenerateQueued({
              uid, idea: { titulo: idea.titulo, porque: idea.porque || idea.angulo }, tipo: idea.tipo, headline, refs, apiKey: key,
              usedStyles, styleOut, productRef,
            });
          } catch (e) {
            console.error(`[pipeline:${tag}] IA imagen falló (intento ${attempt + 1}/3):`, e.message);
            if (attempt < 2) await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
          }
          }
          }
          let finalCode = String(styleOut.code || ''), finalReason = String(styleOut.reason || ''), finalIntent = String(styleOut.intent || '');
          const finalProductRef = String(productRef || '');
          const finalHookId = String((content && content.hookId) || '');
          if (!isCarousel) {
          // Sin fallback plano (2026-10-06, Valentino): si la IA no generó
          // imagen tras los reintentos, NO se crea el borrador. La semana
          // queda con menos posteos reales antes que mostrar un bloque de
          // color como terminado. El retry del sweep (cada 3h) + backfill
          // (8:00) + ensure al abrir reintentan la semana.
          if (!imagePath) {
            console.error(`[pipeline:${tag}] "${idea.titulo || i}": sin imagen IA tras 3 intentos, se salta (no se crea borrador plano)`);
            imgFailCount++;
            continue;
          }
          insStmt.run(uid, imagePath, caption, hashtags, idea.titulo || '', idea.angulo || '', idea.tipo || '', String(idea.porque || '').slice(0, 500), weekKey, needRev, finalCode, finalReason, finalIntent, finalProductRef, finalHookId);
          } else {
            // El carousel se guarda como UN post con media_type='carousel'.
            const paths = [carouselGen.coverPath, ...carouselGen.slidePaths].slice(0, 5);
            db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type,
              carousel_paths, source_topic, source_angle, tipo, strategy_why, week_key, needs_review,
              style_code, style_reason, intent, product_ref, hook_id)
              VALUES (?,?,?,?,'draft','carousel',?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(uid, carouselGen.coverPath, carouselGen.caption, hashtags, JSON.stringify(paths),
                idea.titulo || '', idea.angulo || '', idea.tipo || '', String(idea.porque || '').slice(0, 500),
                weekKey, (needRev || carouselGen.needsReview) ? 1 : 0,
                'carousel', `carousel automático (${carouselGen.slidePaths.length} placas)`,
                finalIntent || 'tips', finalProductRef, finalHookId);
          }
          created++;
        } catch (e) {
          console.error(`[pipeline:${tag}] borrador "${idea.titulo || i}" falló:`, e.message);
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    console.log(`[pipeline:${tag}] usuario ${uid} semana ${weekKey}: ${created}/${picks.length} borradores`);
    // Si la semana quedó incompleta por fallos de imagen IA, alimentar el
    // loop de reintentos (v72): el cron cada 3h la regenera con reason 'img_fail'.
    if (imgFailCount > 0 && created < picks.length) {
      try { recordSweepFailure(uid, weekKey, 'img_fail'); } catch (e) {}
    }
    // Push "tu semana está lista": avisar en el celu para que la revise.
    // quiet (FASE 2): el sweep de nivel 0 manda el email con preview + botón
    // "Publicar semana" en su lugar — el push exigiría entrar a la app.
    if (created > 0 && !quiet) {
      try { push.sendPush(uid, { title: 'Tu semana está lista ✨', body: 'Posty armó tus posteos: revisalos y aprobá 👇', url: '/#/app/semana' }).catch(() => {}); }
      catch (e) { /* el push nunca bloquea */ }
    }
    // Historias + reels del plan: reusan las imágenes recién generadas.
    // Va en try/catch propio: si falla, el autopilot de feed queda intacto.
    try {
      const { generateWeekExtras } = require('./story-reel');
      const feedDrafts = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND week_key = ? AND status = 'draft' AND media_type = 'image' ORDER BY created_at ASC`).all(uid, weekKey);
      await generateWeekExtras({ db, uid, weekKey, tag, mediaDir: MEDIA_DIR, feedDrafts, needsReview: needRev === 1 });
    } catch (e) { console.error(`[pipeline:${tag}] extras historias/reels:`, e.message); }
    return { ok: true, created };
  } finally {
    NEXTWEEK_RUNNING.delete(uid);
  }
}
// ----- Resiliencia del generador semanal (2026-10-05): "la semana nunca queda
// vacía en silencio". Los fallos transitorios del sweep se registran en
// sweep_failures para reintentarse con backoff (retrySweepFailures, cada 3h)
// y con el backfill diario de las 8:00 (backfillThisWeek).
function sweepNowStr() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function recordSweepFailure(uid, weekKey, reason) {
  try {
    const nextRetry = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    db.prepare(`INSERT INTO sweep_failures (user_id, week_key, reason, attempts, next_retry_at, created_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id, week_key) DO UPDATE SET reason = excluded.reason, attempts = 0, next_retry_at = excluded.next_retry_at, created_at = excluded.created_at`)
      .run(uid, weekKey, String(reason || '').slice(0, 200), 0, nextRetry, sweepNowStr());
  } catch (e) { console.error('[sweep-retry] no se pudo registrar el fallo:', e.message); }
}
// Barrido semanal (lo llama el cron de scheduler.js): para cada usuario que
// cumple los gates y no tiene borradores de la próxima semana, generarlos.
// Respaldo por si el trigger inline de schedule-all falló.
async function nextWeekSweep() {
  let users = [];
  try { users = db.prepare('SELECT id FROM users').all(); } catch (e) { return { ok: false, error: e.message }; }
  let ok = 0, skip = 0;
  for (const u of users) {
    let nextWk = null;
    try {
      // FASE 1: evaluación semanal de la escalera de confianza (barata: sale
      // enseguida si el usuario no está en nivel 1).
      try { autopilot.maybeGraduateLevel2(db, u.id); } catch (e) {}
      const tz = userTz(u.id);
      nextWk = shiftDays(mondayKeyOf(tzToday(tz)), 7);
      const elig = nextWeekEligible(u.id, nextWk);
      if (!elig.ok) { skip++; continue; }
      const r = await generateWeekDrafts(u.id, { weekKey: nextWk, tag: 'sweep', quiet: autopilot.trustLevel(db, u.id) === 0 });
      if (r.ok) {
        ok++;
        // FASE 2: nivel 0 → preview por email con "Publicar semana" de un tap
        // (sin login), en vez del push que exige entrar a la app. Nivel ≥1
        // mantiene el aviso de siempre (ya está programada).
        if (autopilot.trustLevel(db, u.id) === 0) {
          let emailed = false;
          try {
            const em = require('./notify-email');
            const er = (em && em.sendWeekPreview) ? await em.sendWeekPreview(db, u.id, nextWk) : null;
            emailed = !!(er && er.ok);
          } catch (e) { console.error('[next-week sweep] week preview:', e.message); }
          if (!emailed) {
            // Fallback: el push de siempre (mejor que silencio si no hay email).
            try { push.sendPush(u.id, { title: 'Tu semana está lista ✨', body: 'Posty armó tus posteos: revisalos y aprobá 👇', url: '/#/app/semana' }).catch(() => {}); }
            catch (e) { /* el push nunca bloquea */ }
          }
        }
        // 🚀 Abrir y listo: la semana semanal también se programa sola.
        // generateWeekDrafts ya generó historias/reels y mandó el push.
        if (autoWeekEnabled(u.id)) {
          try {
            const sa = scheduleAllDrafts(u.id);
            if (sa.ok) console.log(`[next-week sweep] usuario ${u.id}: ${sa.scheduled.length} programados solos 🚀`);
          } catch (e) { console.error('[next-week sweep] auto-schedule:', e.message); }
        }
      } else {
        // Fallo transitorio de IA ('ai_error' / 'no_ideas'): se registra para
        // reintentar con backoff — nunca queda la semana vacía en silencio.
        // Las demás reasons (no_dna, no_plan, ai_cap, already_exists, running)
        // son finales o requieren acción del usuario: no van a retry.
        if (r.reason === 'ai_error' || r.reason === 'no_ideas') recordSweepFailure(u.id, nextWk, r.reason);
        skip++;
      }
    } catch (e) {
      console.error('[next-week sweep] usuario', u.id, e.message);
      if (nextWk) recordSweepFailure(u.id, nextWk, 'exception: ' + String((e && e.message) || e || '').slice(0, 120));
      skip++;
    }
  }
  console.log(`[next-week sweep] generadas: ${ok}, salteadas: ${skip}`);
  return { ok: true, generated: ok, skipped: skip };
}
// Reintenta los fallos registrados del sweep con backoff exponencial
// (3h, 6h, 12h, 12h, 12h; a los 5 intentos se rinde y lo reporta).
// Lo llama el cron de scheduler.js cada 3 horas. Cada usuario está aislado:
// un fallo no mata el loop de los demás.
async function retrySweepFailures() {
  let rows = [];
  try { rows = db.prepare(`SELECT * FROM sweep_failures WHERE next_retry_at <= datetime('now') AND attempts < 5`).all(); }
  catch (e) { console.error('[sweep-retry] query:', e.message); return { ok: false, error: e.message }; }
  let resolved = 0, retried = 0;
  for (const f of rows) {
    try {
      const r = await generateWeekDrafts(f.user_id, { weekKey: f.week_key, tag: 'sweep-retry' });
      const del = () => { try { db.prepare(`DELETE FROM sweep_failures WHERE user_id = ? AND week_key = ?`).run(f.user_id, f.week_key); } catch (e) {} };
      if (r && r.ok) { del(); resolved++; }
      else if (r && (r.reason === 'ai_error' || r.reason === 'no_ideas' || r.reason === 'img_fail')) {
        const attempts = (f.attempts || 0) + 1;
        if (attempts >= 5) {
          del();
          logGenError('sweep', new Error(`semana ${f.week_key} sin generar tras 5 reintentos (uid ${f.user_id})`));
        } else {
          const hours = Math.min(3 * Math.pow(2, attempts), 12);
          const nextRetry = new Date(Date.now() + hours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
          try { db.prepare(`UPDATE sweep_failures SET attempts = ?, reason = ?, next_retry_at = ? WHERE user_id = ? AND week_key = ?`).run(attempts, r.reason, nextRetry, f.user_id, f.week_key); }
          catch (e) { console.error('[sweep-retry] update:', e.message); }
        }
        retried++;
      } else {
        // Reason final (no_dna, no_plan, ai_cap, already_exists, running,
        // inactive_7d, paused_14d): ya no aplica → no tiene sentido seguir
        // reintentando, se limpia la fila.
        del();
      }
    } catch (e) {
      // Excepción inesperada (ej. el usuario fue borrado y getProfile choca
      // con la FK): cuenta como intento para no dejar la fila colgada.
      console.error('[sweep-retry] usuario', f.user_id, e.message);
      const attempts = (f.attempts || 0) + 1;
      if (attempts >= 5) {
        try { db.prepare(`DELETE FROM sweep_failures WHERE user_id = ? AND week_key = ?`).run(f.user_id, f.week_key); } catch (e2) {}
        logGenError('sweep', new Error(`semana ${f.week_key} sin generar tras 5 reintentos (uid ${f.user_id}, excepción)`));
      } else {
        try { db.prepare(`UPDATE sweep_failures SET attempts = ?, next_retry_at = datetime('now', '+3 hours') WHERE user_id = ? AND week_key = ?`).run(attempts, f.user_id, f.week_key); }
        catch (e2) {}
      }
    }
  }
  if (rows.length) console.log(`[sweep-retry] filas: ${rows.length}, resueltas: ${resolved}, reintentadas: ${retried}`);
  return { ok: true, rows: rows.length, resolved, retried };
}
// Backfill diario (cron 8:00 ART en scheduler.js): genera la semana EN CURSO
// para los usuarios que el barrido del domingo no cubrió — aunque el domingo
// falle TODO, el lunes a la mañana la semana existe (tarde, pero existe).
// Idempotente por el guard already_exists (de nextWeekEligible y del pipeline).
async function backfillThisWeek() {
  let users = [];
  try { users = db.prepare('SELECT id FROM users').all(); } catch (e) { return { ok: false, error: e.message }; }
  let ok = 0, skip = 0;
  for (const u of users) {
    let wk = null;
    try {
      wk = mondayKeyOf(tzToday(userTz(u.id)));
      const elig = nextWeekEligible(u.id, wk);
      if (!elig.ok) { skip++; continue; }
      const r = await generateWeekDrafts(u.id, { weekKey: wk, tag: 'backfill' });
      if (r && r.ok) ok++;
      else {
        // El backfill también alimenta el loop de reintentos: si a las 8:00 la
        // IA sigue caída, el cron de cada 3h lo vuelve a intentar.
        if (r && (r.reason === 'ai_error' || r.reason === 'no_ideas')) recordSweepFailure(u.id, wk, r.reason);
        skip++;
      }
    } catch (e) {
      console.error('[backfill] usuario', u.id, e.message);
      if (wk) recordSweepFailure(u.id, wk, 'exception: ' + String((e && e.message) || e || '').slice(0, 120));
      skip++;
    }
  }
  console.log(`[backfill] semanas generadas: ${ok}, salteadas: ${skip}`);
  return { ok: true, generated: ok, skipped: skip };
}
// ----- Agregado Track 4: "si vacía los borradores, se reconstruye con otro enfoque" -----
function rebuildCountFor(uid, wk) {
  try {
    const r = db.prepare('SELECT count FROM rebuild_counts WHERE user_id = ? AND week_key = ?').get(uid, wk);
    return (r && r.count) || 0;
  } catch (e) { return 0; }
}
function bumpRebuildCount(uid, wk) {
  try {
    db.prepare(`INSERT INTO rebuild_counts (user_id, week_key, count) VALUES (?,?,1)
      ON CONFLICT(user_id, week_key) DO UPDATE SET count = count + 1`).run(uid, wk);
  } catch (e) { /* no bloquea */ }
}
// Dispara la reconstrucción de una semana en segundo plano. Asume que los
// borradores ya fueron marcados como rejected y eliminados. Aplica gates + tope
// de 2 reconstrucciones/semana. Devuelve { rebuilding, reason?, count? }.
function maybeStartRebuild(uid, wk) {
  const tz = userTz(uid);
  const week = wk || mondayKeyOf(tzToday(tz));
  if (!planOrTrialOk(uid)) return { rebuilding: false, reason: 'no_plan' };
  // Gates 2 y 4 de actividad: el usuario está tocando la app AHORA MISMO
  // (acaba de vaciar) — trivialmente activo. No se chequean.
  const c = rebuildCountFor(uid, week);
  if (c >= 2) return { rebuilding: false, reason: 'frustrated', count: c };
  bumpRebuildCount(uid, week);
  generateWeekDrafts(uid, { weekKey: week, tag: 'rebuild' })
    .catch((e) => console.error('[rebuild] pipeline:', e.message));
  return { rebuilding: true, count: c + 1 };
}
// Marca borradores como rejected EN BULK (una transacción) y los elimina.
// Los rejected alimentan excludedTopicsLine() (Track D): la próxima tanda sale
// con otros ángulos y tipos automáticamente. Nota: PRAGMA foreign_keys NO está
// activado en db.js, así que las señales sobreviven al DELETE (no hay cascade).
function vaciarYMarcar(uid, drafts, wk) {
  const prof = getProfile(uid) || {};
  const mark = db.prepare(`INSERT INTO post_signals (user_id, post_id, caption, hashtags, scheduled_for, rubro, client_signal, week_key, updated_at)
    VALUES (?,?,?,?,?,?,'rejected',?,datetime('now'))
    ON CONFLICT(user_id, post_id) DO UPDATE SET client_signal='rejected', caption=excluded.caption, hashtags=excluded.hashtags, week_key=excluded.week_key, updated_at=datetime('now')`);
  const del = db.prepare('DELETE FROM posts WHERE id = ?');
  // node:sqlite no tiene db.transaction(): transacción manual.
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const d of drafts) {
      mark.run(uid, d.id, d.caption || '', d.hashtags || '', d.scheduled_at || '', prof.category || '', wk);
      del.run(d.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

// "📅 Programar mi semana →": TODOS los borradores del usuario se programan
// de una, cada uno en su mejor horario. El tap ES la aprobación (sin él,
// nada se programa ni publica). Registra la señal 'approved' por posteo para
// que el aprendizaje no se rompa. Programar SÍ consume cupo (los borradores son gratis).
// ---------- 🚀 ABRIR Y LISTO (2026-10-03) ----------
// Programa todos los borradores listos del usuario en sus horarios óptimos.
// Es la versión interna de POST /api/posts/schedule-all (sin req/res):
// acepta (approval='approved') y programa feed en best_hour, stories 13:00,
// reels en best_hour, sin pisar días ya ocupados. Devuelve { ok, scheduled }.
// Asigna horarios de publicación a borradores: un feed por día desde mañana en
// best_hour (9-21, respaldo 19:00), historias en STORY_HOUR, salteando días ya
// ocupados. No toca la DB: devuelve Map id → 'YYYY-MM-DD HH:MM:SS' (UTC).
// Extraído de scheduleAllDrafts (FASE 2) para reutilizar la misma política en
// el publish firmado de la semana y en el email de preview.
function assignScheduleSlots(uid, drafts) {
  const tz = userTz(uid);
  let bestHour = 19;
  try {
    const u = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(uid);
    if (u && u.best_hour >= 9 && u.best_hour <= 21) bestHour = u.best_hour;
  } catch (e) { /* respaldo 19:00 */ }
  const { STORY_HOUR } = require('./story-reel');
  const taken = new Set();
  const takenStory = new Set();
  try {
    const sched = db.prepare(`SELECT scheduled_at, media_type FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL`).all(uid);
    for (const s of sched) {
      const k = ymdInTz(s.scheduled_at, tz); if (!k) continue;
      if (s.media_type === 'story') takenStory.add(k); else taken.add(k);
    }
  } catch (e) { /* no bloquea */ }
  const slotAt = (i, hour) => {
    const ymd = shiftDays(tzToday(tz), i + 1);
    return zonedWallToUtc(`${ymd} ${String(hour).padStart(2, '0')}:00`, tz);
  };
  const out = new Map();
  let off = 0, offStory = 0, guard = 0;
  for (const d of drafts) {
    const isStory = d.media_type === 'story';
    const hour = isStory ? STORY_HOUR : bestHour;
    const tset = isStory ? takenStory : taken;
    let o = isStory ? offStory : off;
    let iso = null;
    while (guard++ < 160) {
      const cand = slotAt(o++, hour);
      if (!cand) break;
      const k = ymdInTz(cand, tz);
      if (k && !tset.has(k)) { tset.add(k); iso = cand; break; }
    }
    if (isStory) offStory = o; else off = o;
    if (!iso) iso = slotAt(o++, hour);
    if (iso) out.set(d.id, iso);
    // (Si no hay slot —tz inválida—, se saltea: nunca scheduled_at=NULL.)
  }
  return out;
}

function scheduleAllDrafts(uid) {
  const drafts = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=0 ORDER BY created_at ASC`).all(uid);
  if (!drafts.length) return { ok: false, reason: 'no_drafts', scheduled: [] };
  // FASE 0 — qualityGate: solo lo bueno sale solo. El borrador que no pasa
  // el gate queda en 'draft' con needs_review=1 (cola de revisión humana) y
  // no consume cupo. Fail-closed: si el gate tira error, tampoco sale solo.
  const ready = [];
  let gateFailed = 0;
  for (const d of drafts) {
    let g = null;
    try {
      g = autopilot.qualityGate(d, db, MEDIA_DIR);
      autopilot.saveQualityResult(db, d.id, g);
    } catch (e) { console.error(`[autopilot] gate post ${d.id}:`, e.message); }
    if (g && g.pass) { ready.push(d); continue; }
    gateFailed++;
    try { db.prepare(`UPDATE posts SET needs_review=1 WHERE id=?`).run(d.id); } catch (e) {}
    const failed = g
      ? Object.entries(g.checks).filter(([, c]) => !c.ok).map(([k, c]) => `${k}(${c.detail})`).join(', ')
      : 'gate_error';
    console.log(`[autopilot] scheduleAllDrafts: post ${d.id} NO pasa gate (score ${g ? g.score : '?'}): ${failed} → revisión humana`);
  }
  if (!ready.length) return { ok: false, reason: gateFailed > 0 ? 'quality_failed' : 'no_drafts', scheduled: [], gateFailed };
  // Cupo: todos de una o nada (mismo criterio que el endpoint). Solo cuentan los que pasaron el gate.
  const qf = quotaFor(uid, 'image');
  const qr = quotaFor(uid, 'video');
  const qs = quotaFor(uid, 'story');
  const feedBillable = ready.filter((d) => d.media_type !== 'story' && d.media_type !== 'video').length;
  const reelBillable = ready.filter((d) => d.media_type === 'video').length;
  const storyBillable = ready.filter((d) => d.media_type === 'story').length;
  if (feedBillable > qf.left || reelBillable > qr.left || storyBillable > qs.left)
    return { ok: false, reason: 'plan_limit', scheduled: [] };
  const slots = assignScheduleSlots(uid, ready);
  const scheduled = [];
  // FASE 1: auto_published=1 marca lo programado POR EL SISTEMA (sin tap del
  // usuario): así el aviso pre-publicación de 30 min lo cubre como freno de
  // emergencia en nivel 1, y el conteo de semanas limpias (nivel 2) lo ve.
  const upd = db.prepare(`UPDATE posts SET scheduled_at=?, status='scheduled', approval='approved', approved_at=datetime('now'), error='', notified=0, auto_published=1 WHERE id=?`);
  for (const d of ready) {
    const iso = slots.get(d.id);
    if (!iso) continue; // sin slot no se programa (nunca scheduled_at=NULL)
    upd.run(iso, d.id);
    try { recordSignal(uid, d, 'approved'); } catch (e) { /* no bloquea */ }
    scheduled.push({ id: d.id, scheduled_at: iso });
  }
  return { ok: true, scheduled, gateFailed };
}

// Arma la semana sola: genera historias/reels del plan sobre los borradores,
// programa TODO y avisa "tu semana está lista 🎉" (push + email de respaldo).
// Fire-and-forget: nunca tira.
async function autoArmWeek(uid, tag) {
  try {
    tag = tag || 'auto-arm';
    // 1) Historias + reels del plan (si el plan los incluye).
    try {
      const { generateWeekExtras } = require('./story-reel');
      const tz = userTz(uid);
      const weekKey = mondayKeyOf(tzToday(tz));
      const feedDrafts = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND media_type = 'image'
        AND status IN ('draft','scheduled') AND created_at > datetime('now', '-3 days')
        ORDER BY created_at ASC`).all(uid, weekKey);
      if (feedDrafts.length) {
        let needRev = 0;
        try { needRev = trainingWheelsActive(uid) ? 1 : 0; } catch (e) {}
        await generateWeekExtras({ db, uid, weekKey, tag, mediaDir: MEDIA_DIR, feedDrafts, needsReview: needRev === 1 });
      }
    } catch (e) { console.error(`[auto-arm:${tag}] extras:`, e.message); }
    // 2) Programar todo lo listo.
    const r = scheduleAllDrafts(uid);
    if (!r.ok) { console.log(`[auto-arm:${tag}] usuario ${uid}: ${r.reason}`); return r; }
    console.log(`[auto-arm:${tag}] usuario ${uid}: ${r.scheduled.length} programados 🚀`);
    // 3) Aviso "tu semana está lista".
    try {
      const n = r.scheduled.length;
      push.sendPush(uid, {
        title: 'Tu semana está lista 🎉',
        body: `${n} ${n === 1 ? 'posteo sale solo' : 'posteos salen solos'} en su horario. Tocá para verla 👀`,
        url: '/#/app/semana',
      }).catch(() => {});
    } catch (e) { /* el push nunca bloquea */ }
    try {
      const em = require('./notify-email');
      if (em && em.sendWeekReady) em.sendWeekReady(db, uid, r.scheduled.length);
    } catch (e) { /* el email nunca bloquea */ }
    return r;
  } catch (e) {
    console.error(`[auto-arm:${tag}] usuario ${uid}:`, e.message);
    return { ok: false, reason: 'error', scheduled: [] };
  }
}

function autoWeekEnabled(uid) {
  try {
    const r = db.prepare('SELECT auto_week FROM users WHERE id = ?').get(uid);
    return !r || r.auto_week !== 0; // default 1 (migración): opt-out
  } catch (e) { return true; }
}

app.post('/api/posts/schedule-all', requireAuth, (req, res) => {
  const uid = req.session.userId;
  const drafts = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=0 ORDER BY created_at ASC`).all(uid);
  if (!drafts.length) {
    let pending = 0;
    try { pending = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft' AND COALESCE(needs_review,0)=1`).get(uid).n || 0; } catch (e) {}
    if (pending > 0) return res.status(400).json({ error: 'in_review', message: 'Tus primeros posteos están en el horno ✨ Te aviso cuando estén listos para programar.' });
    return res.status(400).json({ error: 'No hay borradores para programar' });
  }
  // Cupo: todos de una o nada. Cada formato contra su propio cupo.
  const qf = quotaFor(uid, 'image');
  const qr = quotaFor(uid, 'video');
  const qs = quotaFor(uid, 'story');
  const feedBillable = drafts.filter((d) => d.media_type !== 'story' && d.media_type !== 'video').length;
  const reelBillable = drafts.filter((d) => d.media_type === 'video').length;
  const storyBillable = drafts.filter((d) => d.media_type === 'story').length;
  const overFmt = reelBillable > qr.left ? 'video' : storyBillable > qs.left ? 'story' : 'image';
  if (feedBillable > qf.left || reelBillable > qr.left || storyBillable > qs.left) {
    const qx = overFmt === 'video' ? qr : overFmt === 'story' ? qs : qf;
    const over = `${qx.limit} ${quotaUnitName(overFmt)}`;
    return res.status(403).json({ error: 'plan_limit', plan_limit: true, limit: qx.limit, plan_name: qf.plan_name,
      message: `Llegaste al límite de tu plan ${qf.plan_name} (${over} por semana). Mejorá tu paquete para seguir posteando esta semana.` });
  }
  const tz = userTz(uid);
  let bestHour = 19;
  try {
    const u = db.prepare('SELECT best_hour FROM users WHERE id = ?').get(uid);
    if (u && u.best_hour >= 9 && u.best_hour <= 21) bestHour = u.best_hour;
  } catch (e) { /* respaldo 19:00 */ }
  // Días ya ocupados por posteos programados: no pisarlos (mismo criterio que
  // suggestSlots() en el frontend). Las historias salen al mediodía (13:00) y
  // PUEDEN compartir día con un posteo de feed (no compiten); entre ellas, 1/día.
  const { STORY_HOUR } = require('./story-reel');
  const taken = new Set();
  const takenStory = new Set();
  try {
    const sched = db.prepare(`SELECT scheduled_at, media_type FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL`).all(uid);
    for (const s of sched) {
      const k = ymdInTz(s.scheduled_at, tz); if (!k) continue;
      if (s.media_type === 'story') takenStory.add(k); else taken.add(k);
    }
  } catch (e) { /* no bloquea */ }
  // Equivalente servidor de slotDate19(i, tz): el día (hoy + i + 1) a la
  // best_hour del negocio en su zona horaria, en ISO UTC. Historias: 13:00.
  const slotAt = (i, hour) => {
    const ymd = shiftDays(tzToday(tz), i + 1);
    return zonedWallToUtc(`${ymd} ${String(hour).padStart(2, '0')}:00`, tz);
  };
  const scheduled = [];
  const upd = db.prepare(`UPDATE posts SET scheduled_at=?, status='scheduled', error='', notified=0 WHERE id=?`);
  let off = 0, offStory = 0, guard = 0;
  for (const d of drafts) {
    const isStory = d.media_type === 'story';
    const hour = isStory ? STORY_HOUR : bestHour;
    const tset = isStory ? takenStory : taken;
    let o = isStory ? offStory : off;
    let iso = null;
    while (guard++ < 160) {
      const cand = slotAt(o++, hour);
      if (!cand) break;
      const k = ymdInTz(cand, tz);
      if (k && !tset.has(k)) { tset.add(k); iso = cand; break; }
    }
    if (isStory) offStory = o; else off = o;
    if (!iso) iso = slotAt(o++, hour); // respaldo: no dejar huecos
    upd.run(iso, d.id);
    try { recordSignal(uid, d, 'approved'); } catch (e) { /* no bloquea */ }
    scheduled.push({ id: d.id, scheduled_at: iso });
  }
  res.json({ ok: true, scheduled });
  // ===== Track 4 "Pipeline perpetuo" =====
  // Al programar la semana N, la N+1 se empieza a armar SOLA en segundo plano.
  // Fire-and-forget: la respuesta ya salió, esto no la bloquea. Solo BORRADORES:
  // nada se programa ni publica sin el tap del usuario.
  try {
    const tz2 = userTz(uid);
    const nextWk = shiftDays(mondayKeyOf(tzToday(tz2)), 7);
    if (nextWeekEligible(uid, nextWk).ok) {
      generateWeekDrafts(uid, { weekKey: nextWk, tag: 'next-week' })
        .catch((e) => console.error('[next-week] pipeline:', e.message));
    }
  } catch (e) { console.error('[next-week] trigger:', e.message); }
});

// Historias + reels del plan para el autopilot manual del browser.
// Corre en segundo plano (los reels tardan ~1 min en ffmpeg): responde al toque
// y los borradores aparecen en "Revisá tu semana" al refrescar.
app.post('/api/posts/generate-extras', requireAuth, (req, res) => {
  const uid = req.session.userId;
  res.json({ ok: true, started: true });
  (async () => {
    try {
      const { generateWeekExtras } = require('./story-reel');
      const tz = userTz(uid);
      const weekKey = mondayKeyOf(tzToday(tz));
      // Borradores de feed recientes (el browser no setea week_key: van con '').
      const feedDrafts = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND media_type = 'image'
        AND status IN ('draft','scheduled') AND (week_key = ? OR week_key = '')
        AND created_at > datetime('now', '-3 days') ORDER BY created_at ASC`).all(uid, weekKey);
      if (!feedDrafts.length) return;
      // Idempotencia: si ya hay historias/reels recientes, no duplicar.
      const existing = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND media_type IN ('story','video')
        AND status != 'cancelled' AND created_at > datetime('now', '-3 days')`).get(uid).n || 0;
      if (existing > 0) { console.log(`[extras:manual] usuario ${uid}: ya existen, skip`); return; }
      await generateWeekExtras({ db, uid, weekKey, tag: 'manual', mediaDir: MEDIA_DIR, feedDrafts, needsReview: trainingWheelsActive(uid) });
    } catch (e) { console.error('[extras:manual]:', e.message); }
  })();
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
      return { error: `Tu Embed URL redirige a ${ru.host}, pero tiene que volver a Posty. En el dashboard de Meta \u2192 tu app \u2192 caso de uso Instagram \u2192 "API setup with Instagram login", pon\u00e9 como redirect URI: https://${thisHost}/api/ig/callback` };
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
    // Style Lock visual + Caption Style Lock + Brief unificado: analizan el IG en
    // background al conectar. El brief se reconstruye cuando terminan ambos
    // análisis (los resume en una sola fuente de verdad). Nunca bloquea la conexión.
    try {
      const uidCb = req.session.userId;
      const vP = analyzeVisualStyle(db, uidCb);
      vP.catch(e => console.error('[ig] style-visual:', e.message));
      const cP = analyzeCaptionStyle(db, uidCb);
      cP.catch(e => console.error('[ig] caption-style:', e.message));
      Promise.allSettled([vP, cP]).then(() => {
        try { refreshClientBrief(db, uidCb).catch(e => console.error('[ig] client-brief:', e.message)); }
        catch (e) { console.error('[ig] client-brief:', e.message); }
      });
    } catch (e) { console.error('[ig] client-brief:', e.message); }
    track(req.session.userId, 'ig_connected');
    evTrack(req.session.userId, 'ig_connect', {});
    delete req.session.igAttemptAt; // conectado: no más banner pendiente
    res.redirect(withQs(igDest(), 'ig=ok' + (wasDemo ? '&demo_off=1' : '') + (brandReset ? '&brand_reset=1' : '')));
  } catch (e) {
    res.redirect(withQs(igDest(), 'ig=error&msg=' + encodeURIComponent(e.message)));
  }
});

// Track B: análisis profundo de Instagram ("Conocer al cliente a fondo").
// Corre analyzeInstagramDeep con las credenciales guardadas y guarda los learnings
// en content_learnings. Nunca devuelve 500: errores → {ok:false, reason}.
app.post('/api/ig/analyze', requireAuth, async (req, res) => {
  try {
    const s = getSettings(req.session.userId);
    if (!s.ig_user_id || !s.ig_access_token) return res.json({ ok: false, reason: 'no_ig' });
    const { analyzeInstagramDeep } = require('./instagram');
    const r = await analyzeInstagramDeep(s.ig_user_id, s.ig_access_token);
    if (r && r.learnings) {
      try {
        db.prepare(`INSERT INTO content_learnings (user_id, learnings_json, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET learnings_json=excluded.learnings_json, updated_at=datetime('now')`)
          .run(req.session.userId, JSON.stringify(r.learnings));
      } catch (e) { console.error('[ig/analyze] save:', e.message); }
      return res.json({ ok: true, learnings: r.learnings });
    }
    return res.json({ ok: false, reason: 'no_data' });
  } catch (e) {
    console.error('[ig/analyze]:', e.message);
    return res.json({ ok: false, reason: 'error' });
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

const fmtPesos = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

// Revalida el 50% off por referidos de un usuario con suscripción activa.
// >= 2 referidos activos → 50% del precio base; < 2 → 100%.
// Idempotente: solo llama a MP si el estado cambió (columna referral_discount).
// Si MP rechaza, NO se toca la DB y el próximo evento reintenta.
async function revalidateReferralDiscount(referrerId) {
  try {
    const u = db.prepare(`SELECT id, email, plan, plan_status, mp_preapproval_id, mp_base_amount, referral_discount FROM users WHERE id = ?`).get(referrerId);
    if (!u) return { ok: false, reason: 'no-user' };
    if (u.plan_status !== 'active' || !u.mp_preapproval_id) return { ok: false, reason: 'no-preapproval' };
    const st = referralStats(u.id);
    const want = st.referred_count >= REFERRALS_NEEDED ? 1 : 0;
    const cur = u.referral_discount ? 1 : 0;
    if (want === cur) return { ok: true, changed: false, discount: want, count: st.referred_count };
    const base = Number(u.mp_base_amount) > 0 ? Number(u.mp_base_amount) : Number((PLANS[u.plan] || {}).price || 0);
    if (!base) { console.log(`[referral-discount] user=${u.id} sin precio base, no hago nada`); return { ok: false, reason: 'no-base' }; }
    const newAmount = want ? Math.round(base * REFERRAL_DISCOUNT) : Math.round(base);
    await mp.updateSubscriptionAmount(u.mp_preapproval_id, newAmount);
    db.prepare(`UPDATE users SET referral_discount = ?, mp_mult = ? WHERE id = ?`).run(want, want ? REFERRAL_DISCOUNT : 1, u.id);
    console.log(`[referral-discount] user=${u.id} count=${st.referred_count} discount=${cur}->${want} old=${fmtPesos(base)} new=${fmtPesos(newAmount)} ok=true`);
    try {
      if (u.email) {
        const priceFull = fmtPesos(base), priceHalf = fmtPesos(base * REFERRAL_DISCOUNT);
        await sendEmail({
          to: u.email,
          subject: want ? '¡Tus 2 referidos ya están adentro! 🎉' : 'Uno de tus referidos canceló 😅',
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
            <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
              <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
            </div>
            <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
              ${want
                ? `<p style="font-size:16px;line-height:1.6">¡Tus 2 referidos ya están adentro! 🎉 Desde este mes pagás la mitad: <b>${priceHalf}</b> en vez de ${priceFull}.</p>
                   <p style="font-size:13px;line-height:1.6;color:#47617A">Mientras tus 2 referidos sigan suscriptos, el descuento sigue 😊</p>`
                : `<p style="font-size:16px;line-height:1.6">Che, uno de tus referidos canceló 😅 Volvés al precio normal de tu plan (${priceFull}).</p>
                   <p style="font-size:13px;line-height:1.6;color:#47617A">Traé a otro y recuperás el 50% off 💪</p>`}
            </div></div>`,
        });
      }
    } catch (e) { console.error('[referral-discount] email:', e.message); }
    return { ok: true, changed: true, discount: want, count: st.referred_count };
  } catch (e) {
    console.error(`[referral-discount] user=${referrerId} ERROR: ${e.message} (DB intacta, reintenta en el próximo evento)`);
    return { ok: false, reason: 'mp-error' };
  }
}

// Nudge "te falta 1": cuando el conteo de referidos activos de un usuario llega
// a 1 (viniendo de 0), se le avisa UNA vez por push + email con su link.
// Idempotente vía users.referral_nudge_sent. No depende de tener suscripción:
// vale también en trial (el descuento se aplica al suscribirse).
async function maybeReferralNudge(referrerId, baseUrl) {
  try {
    const u = db.prepare('SELECT id, email, referral_code, referral_nudge_sent, COALESCE(email_opt_out,0) AS email_opt_out FROM users WHERE id = ?').get(referrerId);
    if (!u) return { ok: false, reason: 'no-user' };
    if (u.referral_nudge_sent) return { ok: false, reason: 'already' };
    const st = referralStats(u.id);
    if (st.referred_count !== 1) return { ok: false, reason: 'count!=' + st.referred_count };
    const link = `${String(baseUrl || '').replace(/\/$/, '')}/?ref=${u.referral_code || ''}`;
    // Flag ANTES de enviar: si el webhook reintenta, no se duplica.
    db.prepare('UPDATE users SET referral_nudge_sent = 1 WHERE id = ?').run(u.id);
    console.log(`[referral-nudge] user=${u.id} llegó a 1 referido: avisando`);
    const title = '🎁 Te falta 1 para pagar la mitad';
    const body = 'Cuando otro amigo se suscriba con tu link, pagás la mitad todos los meses.';
    try {
      await push.sendPush(u.id, {
        title, body, url: '/#/app/ajustes?plan=1',
        data: { url: '/#/app/ajustes?plan=1' },
      });
    } catch (e) { console.error('[referral-nudge] push:', e.message); }
    if (u.email && !u.email_opt_out) {
      try {
        await sendEmail({
          to: u.email,
          subject: title,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
            <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
              <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
            </div>
            <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
              <p style="font-size:16px;line-height:1.6;margin:0 0 8px"><b>🎁 Te falta 1 para pagar la mitad.</b></p>
              <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Ya tenés 1 referido suscripto. Cuando otro amigo se suscriba con tu link, <b>pagás la mitad todos los meses</b> 💪</p>
              <p style="font-size:13px;color:#47617A;margin:0 0 8px">Tu link:</p>
              <p style="font-size:14px;margin:0 0 16px"><a href="${link}" style="color:#2793C8;font-weight:700">${link}</a></p>
              <a href="${link}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;padding:12px 22px;border-radius:10px;text-decoration:none">Compartir mi link →</a>
            </div></div>`,
        });
      } catch (e) { console.error('[referral-nudge] email:', e.message); }
    }
    return { ok: true };
  } catch (e) {
    console.error(`[referral-nudge] user=${referrerId} ERROR:`, e.message);
    return { ok: false, reason: 'error' };
  }
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
// Reactivación de plan (fix auditoría #1): los posteos pausados por trial
// vencido vuelven a 'scheduled' — "reactivá tu plan y siguen solos ✨" — y
// se resetea el aviso, por si el usuario vuelve a vencer alguna vez.
function reactivatePausedPosts(uid) {
  try {
    db.prepare(`UPDATE posts SET status='scheduled', error='' WHERE user_id=? AND status='paused'`).run(uid);
    db.prepare(`UPDATE users SET trial_pause_notified=0 WHERE id=?`).run(uid);
  } catch (e) { console.error('[posta] reactivatePausedPosts:', e.message); }
}

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
  reactivatePausedPosts(u.id);
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
      reactivatePausedPosts(Number(userId));
      track(Number(userId), 'subscribed', planId);
      evTrack(Number(userId), 'payment_ok', { plan: planId });
      console.log(`[posta] ✅ Plan ${planId} activado para el usuario ${userId} (MP ${mpId})`);
      // Referidos: si este usuario vino por referido, revalidar el descuento del referidor
      // y mandar el nudge "te falta 1" si corresponde (una sola vez).
      try {
        const ru = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(Number(userId));
        if (ru && ru.referred_by) {
          revalidateReferralDiscount(ru.referred_by).catch(() => {});
          const whost = req.get('host') || '';
          const wbase = `${whost.startsWith('localhost') ? 'http' : 'https'}://${whost}`;
          maybeReferralNudge(ru.referred_by, wbase).catch(() => {});
        }
      } catch (e) { console.error('[referral-discount] hook webhook authorized:', e.message); }
    } else if (['cancelled', 'paused'].includes(sub.status)) {
      db.prepare(`UPDATE users SET plan_status='cancelled' WHERE id=? AND mp_preapproval_id=?`)
        .run(Number(userId), String(mpId));
      console.log(`[posta] Plan cancelado para el usuario ${userId} (MP ${mpId}, estado ${sub.status})`);
      // Referidos: si este usuario vino por referido, revalidar el descuento del referidor
      try {
        const ru = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(Number(userId));
        if (ru && ru.referred_by) revalidateReferralDiscount(ru.referred_by).catch(() => {});
      } catch (e) { console.error('[referral-discount] hook webhook cancelled:', e.message); }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[posta] Webhook MP falló:', e.message);
    // FIX (2026-10-02): devolver 500 (no 200) para que MercadoPago REINTENTE.
    // Antes devolvía 200 con ok:false y MP nunca reintentaba → usuario pagaba
    // y quedaba sin plan para siempre.
    res.status(500).json({ ok: false, error: 'retry' });
  }
});

app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT plan, mp_preapproval_id, referred_by FROM users WHERE id = ?').get(req.session.userId);
  if (user && user.plan === 'free') return res.status(400).json({ error: 'Esta cuenta es de cortesía y no necesita cancelación.' });
  if (user && user.mp_preapproval_id && mp.mpConfigured()) {
    try {
      await mp.cancelSubscription(user.mp_preapproval_id);
    } catch (e) {
      console.error('[posta] No se pudo cancelar en MP:', e.message);
      return res.status(500).json({ error: 'No pude cancelar en Mercado Pago 😅 Probá de nuevo en unos minutos — si sigue fallando, escribinos' });
    }
  }
  db.prepare(`UPDATE users SET plan_status='cancelled', mp_preapproval_id=NULL, cancel_reason=? WHERE id=?`)
    .run(String((req.body && req.body.reason) || '').slice(0, 60), req.session.userId);
  // Referidos: si este usuario vino por referido, revalidar el descuento del referidor
  try { if (user && user.referred_by) revalidateReferralDiscount(user.referred_by).catch(() => {}); } catch (e) { console.error('[referral-discount] hook cancel:', e.message); }
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

// ---------- Niveles (los sube la marca del cliente; endpoint legacy /api/avatar-level): XP por posteo publicado ----------
// 100 XP por post, 150 por reel. Niveles 1-10 con nombres en rioplatense.
// El guard "visto una vez por nivel" usa milestones_seen con milestone 900+nivel.
const POSTA_LEVELS = [
  { lvl: 1, name: 'Recién llegado', xp: 0 },
  { lvl: 2, name: 'Aprendiz del feed', xp: 100 },
  { lvl: 3, name: 'Ritmo agarrado', xp: 300 },
  { lvl: 4, name: 'Contenido serio', xp: 550 },
  { lvl: 5, name: 'Máquina de contenido', xp: 850 },
  { lvl: 6, name: 'Cara visible', xp: 1200 },
  { lvl: 7, name: 'Referente del rubro', xp: 1600 },
  { lvl: 8, name: 'Imparable', xp: 2100 },
  { lvl: 9, name: 'Ídolo local', xp: 2650 },
  { lvl: 10, name: 'Leyenda del barrio', xp: 3300 },
];
function postaLevelFor(xp) {
  let cur = POSTA_LEVELS[0];
  for (const l of POSTA_LEVELS) if (xp >= l.xp) cur = l;
  return cur;
}
function postaTier(lvl) { return lvl >= 7 ? 'gold' : lvl >= 5 ? 'silver' : lvl >= 3 ? 'bronze' : 'none'; }
app.get('/api/avatar-level', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`SELECT media_type, COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published' AND media_type != 'story' GROUP BY media_type`).all(req.session.userId);
    let xp = 0, published = 0;
    for (const r of rows) { const n = r.c || 0; published += n; xp += n * (r.media_type === 'video' ? 150 : 100); }
    const cur = postaLevelFor(xp);
    const idx = POSTA_LEVELS.indexOf(cur);
    const next = POSTA_LEVELS[idx + 1] || null;
    const seen = db.prepare('SELECT milestone FROM milestones_seen WHERE user_id = ? AND milestone >= 900').all(req.session.userId).map(r => r.milestone - 900);
    const unseen = POSTA_LEVELS.filter(l => l.lvl > 1 && l.lvl <= cur.lvl && !seen.includes(l.lvl)).map(l => l.lvl);
    res.json({ ok: true, xp, level: cur.lvl, levelName: cur.name, tier: postaTier(cur.lvl), published, nextXp: next ? next.xp : null, nextName: next ? next.name : null, unseenLevels: unseen });
  } catch (e) { res.json({ ok: false }); }
});
app.post('/api/avatar-level/seen', requireAuth, (req, res) => {
  try {
    const lvls = Array.isArray(req.body && req.body.levels) ? req.body.levels : [];
    for (const l of lvls) {
      const n = Number(l);
      if (n >= 2 && n <= 10) db.prepare('INSERT OR IGNORE INTO milestones_seen (user_id, milestone) VALUES (?, ?)').run(req.session.userId, 900 + n);
    }
  } catch (e) {}
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
    costs.trackUsage({ feature: 'concept-shot', model: 'gpt-4o-mini', json: j });
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
          userId: uid, usedHookIds: recentHookIds(uid),
          business: profile.business_name, category: profile.category, tone: profile.tone,
          description: profile.description, dna: readDna(uid),
          topic: `Reescribí este posteo que funcionó muy bien, con texto fresco y otro ángulo. NO lo copies: hacelo nuevo sobre la misma idea. Idea original: "${String(old.caption || '').slice(0, 300)}"`,
          competitors: profile.competitors, goal: profile.goal,
          taste: tasteProfile(uid),
          tipo: TIPOS_VALIDOS.includes(old.tipo) ? old.tipo : '',
          performance: performanceBrief(db, uid),
          captionExtras: captionExtrasFor(uid),
        }, apiKey);
        caption = (out && out.caption) || ''; hashtags = (out && out.hashtags) || '';
        recordHookUse(uid, out && out.hookId);
      } catch (e) { console.error('[recycle] generate:', e.message); }
    }
    if (!String(caption).trim()) caption = String(old.caption || '').slice(0, 500);
    const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, tipo, needs_review) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uid, '', caption, hashtags, 'draft', 'image', 'reciclado', TIPOS_VALIDOS.includes(old.tipo) ? old.tipo : '', trainingWheelsActive(uid) ? 1 : 0);
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
    res.status(500).json({ error: 'No pude guardarlo 😅 Probá de nuevo' });
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
    res.status(500).json({ error: 'No pude guardarlo 😅 Probá de nuevo' });
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
    res.json({ ok: true, week_key: '', need: '', uploaded: 0, done: false });
  }
});

// Product shot con IA: si el cliente no subió fotos ESTA semana pero tiene de
// antes, la IA genera una variación nueva BASADA en sus fotos reales (referencia).
// Así el sistema "aprende" cómo se ve su producto y no repite las mismas fotos.
// Helper: fragmento de estilo para product-shot (estilo manual o auto-pick
// por tema/rubro). Va AL FINAL del prompt, con supremacía de paleta.
// Devuelve '' si el módulo no está. Nunca lanza.
function styleFragFor(styleCode, settings, profile) {
  try {
    const st = styleCode
      ? getStyle(styleCode)
      : ((pickStyle({ theme: '', rubro: (profile && profile.category) || '' }) || {}).style || null);
    if (!st) return '';
    const hexes = (typeof parseBrandHexes === 'function' && settings) ? parseBrandHexes(settings.brand_colors) : [];
    return '\n' + styleFragment(st, hexes);
  } catch (e) { return ''; }
}
app.post('/api/product-shot', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    try { costs.assertAiOk(req.session.userId); }
    catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message }); throw e; }
    if (!costs.checkRate(req.session.userId, 'regen', aiLimitsFor(req.session.userId).regensPerDay).ok)
      return res.json({ ok: false, error: costs.MSG_REGEN_RATE });
    const { refs = [], idea = '', angle = '', style = '' } = req.body || {};
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
      `Sin texto, sin letras, sin logos, sin marcas de agua. Calidad de fotografía comercial profesional.` +
      styleFragFor(style, settings, profile);
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt);
    // UNA sola imagen: OpenAI rechaza múltiples campos 'image' ("Duplicate parameter").
    const p0 = absRefs[0];
    const buf = fs.readFileSync(p0);
    const ext = path.extname(p0).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    form.append('image', new Blob([buf], { type: mime }), 'ref' + ext);
    form.append('size', '1024x1024');
    form.append('quality', costs.IMAGE_QUALITY); // config en costs.js (env IMAGE_QUALITY)
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
    costs.trackUsage({ feature: 'concept-shot', userId: req.session.userId, model: 'gpt-image-2', images: 1, json: data });
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) throw new Error('OpenAI no devolvió imagen');
    const name = saveImageB64(b64);
    console.log(`[product-shot] generado para usuario ${req.session.userId} (${absRefs.length} refs)`);
    res.json({ ok: true, path: `/media/${name}` });
  } catch (e) {
    console.error('[product-shot]', e.message);
    if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, error: e.message });
    res.status(500).json({ error: 'No se pudo generar la imagen' });
  }
});

// ---------- Motor de imágenes nivel agencia ----------
// Expande un brief corto en un prompt de imagen publicitaria premium (gpt-4o-mini),
// que después se renderiza con gpt-image-2 en /api/concept-shot o /api/product-shot.

// brand_colors llega como string JSON '["#2793C8","#FEC14D"]' o '' → extrae hex válidos.
function parseBrandHexes(brandColorsRaw) {
  try {
    const arr = JSON.parse(String(brandColorsRaw || ''));
    if (Array.isArray(arr)) return arr.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 3);
  } catch (e) {}
  return [];
}
// Guarda un b64 de imagen en MEDIA_DIR y devuelve el nombre del archivo.
function saveImageB64(b64) {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`;
  fs.writeFileSync(path.join(MEDIA_DIR, name), Buffer.from(b64, 'base64'));
  return name;
}
// Familia visual según tipo de contenido: qué escena pide cada concepto.
const CONCEPT_FAMILIES = {
  promo: 'oferta irresistible, producto héroe en escena',
  tip: 'editorial limpio y conceptual',
  social: 'prueba social, escena real y cálida',
  detras: 'detrás de escena fotorrealista',
  novedad: 'anuncio impactante de lanzamiento',
};
// ADN extendido → línea compacta para el director de arte.
function dnaBitsLine(dna) {
  if (!dna || typeof dna !== 'object') return '';
  const bits = [];
  if (dna.producto_estrella) bits.push(`Producto estrella: ${String(dna.producto_estrella).slice(0, 120)}.`);
  if (Array.isArray(dna.productos)) {
    const prods = dna.productos.slice(0, 3).map((x) => (x && x.nombre) || x).filter(Boolean);
    if (prods.length) bits.push(`Productos: ${prods.join(', ')}.`);
  }
  if (dna.tono) bits.push(`Tono de marca: ${String(dna.tono).slice(0, 80)}.`);
  if (dna.inspo) bits.push(`Referencia de estilo del cliente: ${String(dna.inspo).slice(0, 200)}.`);
  if (dna.diferencial) bits.push(`Diferencial: ${String(dna.diferencial).slice(0, 120)}.`);
  return bits.join(' ');
}
// Learnings de contenido (Track B) → línea compacta.
function learningsLineOf(learnings) {
  if (!learnings || typeof learnings !== 'object') return '';
  const bits = [];
  for (const [k, v] of Object.entries(learnings)) {
    if (v == null || (typeof v === 'object' && !Array.isArray(v))) continue;
    const vs = Array.isArray(v) ? v.slice(0, 4).join(', ') : String(v);
    if (!String(vs).trim()) continue;
    bits.push(`${k}: ${String(vs).slice(0, 100)}`);
    if (bits.length >= 4) break;
  }
  return bits.join(' | ');
}
// Llama a gpt-4o-mini como director de arte publicitario y devuelve el prompt
// expandido listo para gpt-image-2. REGLA DURA: jamás inventar datos del negocio
// (precios, direcciones, promos, teléfonos) en el texto de la imagen: solo el
// headline provisto, tal cual, o ningún texto si viene vacío.
async function expandArtBrief({ headline, tipo, angle, businessName, category, paletteHex, dnaBits, learningsLine, theme, styleRules, visualStyle, tasteBlock }, apiKey) {
  const hexes = Array.isArray(paletteHex) ? paletteHex : [];
  // ===== Track D — señales de aprendizaje (bloque delimitado; no toca el inspo del track C) =====
  // style_rules también son ley en la estética: p.ej. "sin emojis" o "siempre con
  // precio" cambian lo que la imagen puede mostrar/decir.
  // Niveles que se sienten (level-boosts, N3+): tasteBlock reemplaza la formulación
  // suave por el bloque OBLIGATORIO de gusto + NUNCA:. Sin tasteBlock, byte-idéntico.
  const styleBrief = tasteBlock
    ? `\n${tasteBlock}\n(Estas reglas también valen para la estética y cualquier texto de la imagen: son OBLIGATORIAS.)`
    : (Array.isArray(styleRules) && styleRules.length)
      ? `\nReglas de estilo del cliente (respetalas en la estética y en cualquier texto de la imagen):\n${styleRules.map(r => `- ${r}`).join('\n')}`
      : '';
  // ===== Style Lock visual — el feed del cliente ya tiene una estética definida:
  // las imágenes generadas deben parecer del MISMO feed (bloque delimitado).
  // Pesa FUERTE: el bloque viaja PRIMERO en el mensaje al director de arte (los
  // modelos ponderan el inicio) y el system le ordena abrir el prompt generado
  // con él + cerrarlo con la línea de supremacía. Sin perfil → '' y el mensaje
  // queda byte-idéntico al baseline. =====
  const visualBrief = (visualStyle && String(visualStyle).trim())
    ? `LÍNEA VISUAL OBLIGATORIA — el cliente ya tiene un Instagram con una estética definida y TUS imágenes deben parecer del MISMO feed:\n${String(visualStyle).trim()}`
    : '';
  const fam = CONCEPT_FAMILIES[tipo] || 'contenido visual atractivo de alto nivel';
  // REGLA DURA: la IA genera la imagen 100% LIMPIA, sin ningún texto.
  // El titular se compone DESPUÉS con código (composite-headline.py): tipografía
  // perfecta, siempre entra completo, nunca se recorta ni se escribe mal.
  // El headline viaja igual en el brief para que la escena acompañe el tema.
  const textRule = `SIN texto en la imagen: ni letras, ni palabras, ni números, ni precios, ni direcciones, ni teléfonos. La imagen debe estar 100% limpia de texto — el titular se agrega después por separado.`;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content:
`Sos un director de arte publicitario de clase mundial. Expandís un brief corto en UN prompt de imagen publicitaria (en inglés), listo para un generador de imágenes. Devolvé SOLO el prompt, sin explicaciones ni comillas.

El prompt DEBE exigir:
- Una escena CONCRETA y ESPECÍFICA del rubro (nada genérico: describí objetos, ambiente, fondo, detalles tangibles).
- La iluminación descripta (ej. luz natural suave de ventana, hora dorada, neón nocturno, estudio con softbox).
- La composición (plano, encuadre, qué va en primer plano y qué en el fondo).
- Estética publicitaria premium: incluí los marcadores "fotografía comercial profesional" y "high-end advertising".
- FORMATO VERTICAL 4:5, optimizado para verse en un CELULAR: es una pieza de Instagram, no un banner de web.
- PROHIBIDO RENDERIZAR TEXTO (2026-10-06, causa raíz de 19/20 fallas de la auditoría del 4-5/10: la instrucción vieja pedía "el titular GRANDE en la imagen" y el generador horneaba palabras en inglés, typos como "Backgnina"/"inatogram"/"Iratigran", claims inventados y logos de marcas): la imagen sale 100% SIN letras, palabras ni números — el titular NO se dibuja en la imagen, NO se inventa texto "parecido al titular", NO hay texto de escena ni de relleno. El titular se compone DESPUÉS por código (composite-headline.py) en el tercio superior reservado.
- ZONA SEGURA: lo importante (producto, caras) va del centro hacia abajo, con margen generoso — NADA importante pegado a los bordes, porque Instagram recorta. El tercio superior queda LIMPIO para el titular que agrega el código después.
- Los colores EXACTOS de la paleta del cliente integrados EN la escena (props, vestuario, packaging, detalles del ambiente): ${hexes.join(', ') || 'sin paleta definida, usá colores armónicos del rubro'}. NUNCA como fondo plano de color.
- "${textRule}"
- "sin marca de agua".
- Si el brief trae un ángulo estratégico, la escena tiene que EXPRESARLO visualmente (no describirlo con texto).
- IDENTIDAD PROPIA (draft 76, revisión 2026-09-29): la estética es del RUBRO del cliente con SU paleta — NUNCA imites el estilo visual de marcas famosas (nada de estética "Netflix"/streaming, Spotify, McDonald's, Apple...). Prohibido el fondo negro-rojo cinematográfico genérico y cualquier look que parezca otra marca.
- IDENTIDAD-RUBRO (Mora, revisión 2026-10-07, id 13 — fallo REAL: "personaje animado que no refleja la identidad del rubro"): el personaje animado / mascota de dibujos solo se usa cuando refleja la identidad REAL del rubro. JAMÁS metas un personaje de dibujitos en una escena de un rubro que vende lo real (cafetería, panadería, gastronomía, estética...): ahí la escena es fotográfica del producto/lugar real, sin dibujitos. La mascota solo aparece en escenas donde el rubro la admite (la marca @posty.hacetodo sí la admite para hablar de sí misma; el cliente que vende café, no).
- Anti-estética de stock corporativo: prohibida la estética de stock corporativo — la imagen tiene que poder pasar por el negocio real del cliente (su local, sus productos, su gente), nunca por un banco de imágenes genérico.
- ESPECIFICIDAD TOTAL: el prompt nombra elementos CONCRETOS del brief — nombres reales de productos, los hex exactos de la paleta aplicados a objetos de la escena (props, vestuario, packaging, detalles del local), rasgos del local o del negocio — en vez de descripciones vagas ("un café", "un producto", "una tienda"). Si el brief trae productos reales, son los PROTAGONISTAS de la escena, con su nombre y su aspecto descriptos.
- PESO MÁXIMO A LA LÍNEA VISUAL DEL CLIENTE: si el brief trae el bloque "LÍNEA VISUAL OBLIGATORIA", el prompt generado EMPIEZA con ese bloque (es lo primero del prompt: los generadores ponderan el inicio) y TERMINA con esta línea de cierre, textual: "If anything above contradicts the client's visual line, the CLIENT'S VISUAL LINE wins — always follow it."
- BLOQUE DE RECHAZO OBLIGATORIO: el prompt generado TERMINA (justo antes de la línea de cierre, si la hay) con un bloque "AVOID:" que prohíba explícitamente: estética de stock genérico o de banco de imágenes; manos, dedos, caras o proporciones deformadas — anatomía siempre natural y realista; texto deformado, garbled, truncado o ilegible — CERO texto legible en la imagen, sin excepción: lo que naturalmente llevaría texto (pantallas, carteles, etiquetas, vidrieras, ropa con estampa) va en BLANCO, APAGADO, VACÍO o DESENFOCADO hasta ser ilegible; el ÚNICO texto de la pieza es el titular y lo agrega el código DESPUÉS, nunca el generador; logos, iconos o estética reconocible de marcas reales (nada de iconos de Instagram/WhatsApp/Amazon ni logos de otras empresas); marcas de agua o sellos de bancos de imágenes; fondos grises planos o fondos de estudio vacíos sin ambiente.
- Ningún elemento decorativo (emoji, sticker, marco, sello) puede tapar el producto: que ningún elemento decorativo cubra el producto; el producto ocupa el centro visual siempre.
- VARA DE CALIDAD (piezas de referencia aprobadas 2026-10-03): la imagen tiene que sentirse PREMIUM y profesional — composición limpia con aire, un protagonista claro, iluminación cuidada, acabado de publicidad de alto nivel. Nada de estética amateur, genérica o de "IA barata". REGLA DE ZONA DEL TITULAR (2026-10-04, fallas reales: antenas, copas, calendarios y confeti tapando el titular en posteos publicados): el tercio superior de la imagen es ZONA LIMPIA RESERVADA — solo fondo suave, desenfocado o degradado liso; NINGÚN sujeto, prop, antena, mano, copa, cartel, calendario, confeti ni elemento nítido puede asomarse ni tocar esa zona. El protagonista y la acción viven del centro hacia abajo. El titular se compone después por código en ese tercio superior y tiene que respirar: nada detrás que lo choque ni le compita.
- REGLA ZERO-TEXT (reemplaza draft 75 — fallas reales 2026-10-05: el generador horneaba texto en inglés, typos como "Backgnina"/"inatogram", logos de marcas reales y claims inventados en pantallas y carteles): CERO texto legible en la imagen — ni una palabra, ni una letra, ni un número, en ningún idioma. Si la escena incluye pantallas, carteles, vidrieras, interfaces, celulares, etiquetas, ropa con estampas o fondos con letras: TODO va en BLANCO, APAGADO, VACÍO o DESENFOCADO hasta ser ilegible — nunca palabras "reales del negocio", nunca iconos de marcas reales. El ÚNICO texto que lleva la pieza es el titular, que se compone DESPUÉS por código.
REGLA DURA: JAMÁS inventes datos del negocio (precios, direcciones, promos, teléfonos, nombres de producto que no se provean). Solo el titular provisto, tal cual.` },
        { role: 'user', content:
`${visualBrief ? `${visualBrief}\n` : ''}Negocio: ${businessName || 'sin nombre'}${category ? ` (${category})` : ''}
Familia visual: ${fam}
${theme ? `Tema del posteo (informá la escena, NO lo pongas como texto salvo que sea el titular): ${String(theme).slice(0, 160)}` : ''}
${angle ? `Ángulo estratégico (expresalo visualmente, sin texto): ${String(angle).slice(0, 200)}` : 'Sin ángulo: escena fuerte del rubro.'}
${dnaBits ? `Contexto del negocio: ${String(dnaBits).slice(0, 300)}` : ''}
${learningsLine ? `Qué rinde en su Instagram: ${String(learningsLine).slice(0, 200)}` : ''}${styleBrief ? `\n${styleBrief}` : ''}`.trim() },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`brief ${r.status}: ${t.slice(0, 160)}`);
  }
  const j = await r.json().catch(() => null);
  costs.trackUsage({ feature: 'concept-shot', model: 'gpt-4o-mini', json: j });
  const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  if (!content.trim()) throw new Error('brief vacío de OpenAI');
  return content.trim();
}
// idea puede venir como string u objeto {titulo, porque, angulo, headline}.
function parseIdea(idea) {
  if (idea && typeof idea === 'object' && !Array.isArray(idea)) return idea;
  return { titulo: String(idea || '') };
}
// 1-2 datos comerciales reales del ADN para contrastar claims en el QA visual.
function qaFactsLine(dna) {
  if (!dna || typeof dna !== 'object') return '';
  const facts = [];
  if (Array.isArray(dna.productos) && dna.productos.length) {
    const p = dna.productos[0];
    if (p && (p.nombre || p.precio)) facts.push(`Producto real: ${(p.nombre || '')}${p.precio ? ` (${p.precio})` : ''}`);
  }
  if (Array.isArray(dna.promos_activas) && dna.promos_activas.length) {
    const pr = dna.promos_activas[0];
    if (pr && (pr.titulo || pr)) facts.push(`Promo real: ${pr.titulo || pr}`);
  }
  return facts.slice(0, 2).join(' | ');
}
// Ojo crítico: control de calidad visual de la imagen generada con gpt-4o-mini.
// Verifica texto_ok / colores_ok / claims_ok y devuelve el objeto parseado.
// Devuelve null si el QA no pudo correr (red/timeout): no bloquea, se entrega la imagen.
// Si el JSON sale roto → texto_ok=false (conservador).
async function qaImageB64(b64, { headline, paletteHex, dnaFacts }, apiKey) {
  try {
    const hexes = Array.isArray(paletteHex) ? paletteHex : [];
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: 'system', content:
`Sos el control de calidad de una agencia de publicidad. Mirás una imagen generada para el Instagram de un negocio y la evaluás contra el brief. Esta imagen se va a ver en un CELULAR. Respondé SOLO con JSON, sin explicaciones:
{"brand_ok":true,"texto_ok":true,"colores_ok":true,"claims_ok":true,"mobile_ok":true,"headline_complete":true,"headline_clear":true,"detalle":"...","anatomia_ok":true}
- texto_ok: el texto en español DENTRO de la imagen está bien escrito (sin palabras garbled, truncadas o inventadas; tildes aceptables). Si la imagen NO lleva texto → true.
- headline_complete: el titular visible en la imagen está COMPLETO — no termina a mitad de oración, no termina en preposición/artículo/conjunción (de, del, la, el, en, con, y, que…), y ninguna palabra se ve cortada a la mitad. Si la imagen NO lleva texto → true.
- headline_clear (2026-10-04, fallas reales: antenas, copas, calendarios y confeti tapando el titular): el tercio superior de la imagen —la zona donde se compone el titular por código— está DESPEJADO: ningún sujeto, prop, antena, mano, copa, cartel, calendario, confeti ni elemento nítido de la escena invade esa zona ni tocaría/competiría con el texto. Si algo de la escena se mete en el tercio superior → false. Si la imagen NO lleva titular → true.
- mobile_ok: el diseño funciona en celular — el titular (si hay) es GRANDE y legible a simple vista, hay alto contraste, y lo importante NO está pegado a los bordes (zona segura). Si algo clave se ve chico, apretado o cortado → false.
- colores_ok: aparecen los colores de la marca en la escena (props, vestuario, packaging, ambiente), no solo como fondo plano. Colores de marca: ${hexes.join(', ') || 'no definidos'}. Si no hay paleta definida → true.
- claims_ok: NO hay datos comerciales inventados del negocio: precios, direcciones, teléfonos, promos, features o nombres de producto que no existan. El ÚNICO texto comercial permitido es el titular: "${String(headline || '').slice(0, 80)}"${headline ? '' : ' (la imagen NO debe llevar texto comercial)'}. Datos reales del negocio para contrastar: ${dnaFacts || 'no hay datos'}. Ante la duda: si el texto menciona un dato comercial que NO sea el titular permitido → claims_ok false.
- brand_ok: la imagen tiene identidad visual PROPIA del rubro y la marca del cliente: NO imita el estilo de marcas famosas (prohibido estética tipo Netflix/plataformas de streaming, Spotify, McDonald's, Apple: nada de fondo negro + rojo cinematográfico, logos parecidos ni tipografías de marca ajena).
- anatomia_ok: inspección de anatomía en todo lo generado — manos, caras, dedos y proporciones tienen que verse naturales; si hay un artefacto detectado = pieza descartada (anatomia_ok false).` },
          { role: 'user', content: [
            { type: 'text', text: 'Evaluá esta imagen contra el brief.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ] },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    costs.trackUsage({ feature: 'vision-qa', model: 'gpt-4o-mini', json: j });
    const raw = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    const parsed = parseLooseJson(raw);
    if (!parsed || typeof parsed !== 'object')
      return { texto_ok: false, colores_ok: true, claims_ok: true, mobile_ok: true, detalle: 'QA: respuesta ilegible (conservador)' };
    return {
      texto_ok: parsed.texto_ok !== false,
      headline_complete: parsed.headline_complete !== false,
      headline_clear: parsed.headline_clear !== false, // 2026-10-04: zona del titular despejada
      brand_ok: parsed.brand_ok !== false, // draft 76: la imagen parecía Netflix (estilo de marca ajena)
      colores_ok: parsed.colores_ok !== false,
      claims_ok: parsed.claims_ok !== false,
      mobile_ok: parsed.mobile_ok !== false,
      anatomia_ok: parsed.anatomia_ok !== false, // manos/caras deformadas = pieza descartada
      detalle: String(parsed.detalle || '').slice(0, 140),
    };
  } catch (e) {
    return null; // QA silencioso: no bloquea la entrega de la imagen
  }
}
// ---------- Chequeo automático de marca (Style Lock) ----------
// Visión post-generación con gpt-4o (el usuario lo pidió explícito, no mini):
// verifica paleta integrada, logo idéntico y línea visual. Nunca lanza:
// devuelve null ante cualquier falla (red, API, JSON ilegible) y el flujo
// acepta la imagen en vez de bloquear.
async function qaBrandB64(b64, { paletteHex, logoPresent, visualBlock }, apiKey) {
  try {
    const hexes = Array.isArray(paletteHex) ? paletteHex : [];
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content:
`Sos el guardián de marca. Mirás la imagen generada para el Instagram de un negocio y verificás:
1) paleta_ok: ¿aparecen los colores de la marca INTEGRADOS en la escena? Colores: ${hexes.join(', ') || 'no definidos'}.
2) logo_ok: ${logoPresent ? '¿aparece el logo de marca IDÉNTICO al de referencia, sin rediseños ni deformaciones?' : 'sin logo definido → true'}.
3) linea_ok: ¿respeta la línea visual del cliente? ${visualBlock ? visualBlock : 'sin perfil definido → true'}.
Respondé SOLO JSON: {paleta_ok, logo_ok, linea_ok, detalle}.` },
          { role: 'user', content: [
            { type: 'text', text: 'Verificá esta imagen contra la marca del cliente.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ] },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    costs.trackUsage({ feature: 'brand-check', model: 'gpt-4o', json: j });
    const raw = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    const parsed = parseLooseJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      paleta_ok: parsed.paleta_ok !== false,
      logo_ok: parsed.logo_ok !== false,
      linea_ok: parsed.linea_ok !== false,
      detalle: String(parsed.detalle || '').slice(0, 140),
    };
  } catch (e) {
    return null; // el brand check nunca bloquea: ante falla se acepta la imagen
  }
}
// ---------- QA visual extendido (tanda D, casos 83-91) ----------
// Reglas duras del director/QA que aplican a toda pieza antes de mostrarse:
// - resolución mínima para feed: si la imagen no la cumple, se avisa en 1
//   línea y se ofrece alternativa (re-fotografiar o regenerar).
// - el formato pedido es contrato: chequeo automático de aspect ratio antes
//   de mostrar la pieza (si se pidió vertical 4:5, se entrega vertical 4:5).
// - anti-duplicado visual: comparación visual contra los posteos de los
//   últimos 7 días; similitud alta = cambiar la propuesta.
const QA_MIN_W = 1024, QA_MIN_H = 1280; // resolución mínima para feed
const QA_ASPECT_45 = 4 / 5; // el formato pedido es contrato: vertical 4:5
// Lee ancho×alto de un PNG desde su base64 (solo los primeros bytes, sin
// decodificar la imagen entera). Devuelve null si no es PNG legible.
function pngDimsB64(b64) {
  try {
    const buf = Buffer.from(String(b64 || '').slice(0, 100), 'base64');
    if (buf.length < 33 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch (e) { return null; }
}
function qaResolutionOk(b64) {
  const d = pngDimsB64(b64);
  if (!d) return true; // no se pudo leer: no bloquea la entrega
  return d.w >= QA_MIN_W && d.h >= QA_MIN_H;
}
// Chequeo automático de aspect ratio antes de mostrar la pieza (tolerancia 5%).
function qaAspectOk(b64, expectedRatio) {
  const d = pngDimsB64(b64);
  if (!d || !d.h || !expectedRatio) return true;
  return Math.abs((d.w / d.h) - expectedRatio) / expectedRatio <= 0.05;
}
// Anti-duplicado visual: comparación visual (titular/tema) contra los posteos
// de los últimos 7 días; similitud alta = cambiar la propuesta.
function qaDedupe7d(uid, headline) {
  try {
    const words = new Set(String(headline || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4));
    if (!words.size || uid == null) return { ok: true };
    const rows = db.prepare(`SELECT caption FROM posts WHERE user_id = ? AND status != 'cancelled' AND created_at >= datetime('now', '-7 days')`).all(uid);
    for (const r of rows) {
      const cw = String(r.caption || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4);
      if (!cw.length) continue;
      const hit = [...words].filter(w => cw.includes(w)).length;
      if (hit / words.size >= 0.6) return { ok: false, caption: String(r.caption || '').slice(0, 80) };
    }
    return { ok: true };
  } catch (e) { return { ok: true }; } // ante cualquier duda, no bloquea
}
// Llama a gpt-image-2 con refs (edits) o sin refs (generations). Devuelve el b64.
// Lanza Error con el mensaje de OpenAI recortado si falla.
async function genConceptImage(apiKey, prompt, absRefs, refNote, uid) {
  let r;
  if (absRefs.length) {
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', prompt + ' ' + (refNote || 'IMPORTANT: keep the SAME product from the reference photos, recognizable (same colors, same packaging, same photographic style), but in a different scene/moment than the photos.'));
    // UNA sola imagen de referencia: OpenAI rechaza múltiples campos 'image'
    // ("Duplicate parameter"). Va la primera (la de mayor prioridad: logo > producto > fotos).
    const p0 = absRefs[0];
    const buf = fs.readFileSync(p0);
    const ext = path.extname(p0).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    form.append('image', new Blob([buf], { type: mime }), 'ref' + ext);
    form.append('size', '1024x1536'); // vertical 4:5: formato ideal para celular e Instagram
    form.append('quality', costs.IMAGE_QUALITY); // config en costs.js (env IMAGE_QUALITY): medium en vez de auto (auto puede resolver a high = 4x)
    r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
  } else {
    r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1024x1536', quality: costs.IMAGE_QUALITY }), // config en costs.js (env IMAGE_QUALITY)
      signal: AbortSignal.timeout(120000),
    });
  }
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 160)}`);
  }
  const data = await r.json();
  costs.trackUsage({ feature: 'concept-shot', userId: uid, model: 'gpt-image-2', images: 1, json: data });
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('OpenAI no devolvió imagen');
  return b64;
}
// Devuelve SOLO el prompt expandido para un concepto. Útil para previsualizar
// el brief antes de gastar una generación de imagen.
app.post('/api/image-brief', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    try { costs.assertAiOk(uid); }
    catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ error: e.message }); throw e; }
    const { idea = '', tipo = '', headline = '', business_name = '', category = '' } = req.body || {};
    const ideaObj = parseIdea(idea);
    if (!String(headline || '').trim() && !String(ideaObj.titulo || '').trim())
      return res.status(400).json({ error: 'Falta la idea o el titular del concepto' });
    const profile = getProfile(uid);
    const settings = getSettings(uid);
    const apiKey = settings.openai_key || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ error: 'Sin clave de OpenAI' });
    let styleRules = [];
    try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(uid).map(r => r.rule_text); } catch (e) {}
    // Style Lock visual: línea estética del feed del cliente (si existe).
    let visualStyle = '';
    try { const vp = getVisualStyle(db, uid); visualStyle = visualStyleBlock(vp); } catch (e) {}
    const prompt = await expandArtBrief(levelBoosted(uid, 'image', {
      headline: String(headline || '').trim(),
      tipo: String(tipo || ''),
      angle: ideaObj.porque || ideaObj.angulo || '',
      theme: ideaObj.titulo || ideaObj.tema || '',
      businessName: business_name || profile.business_name,
      category: category || profile.category,
      paletteHex: parseBrandHexes(settings.brand_colors),
      dnaBits: dnaBitsLine(readDna(uid)),
      learningsLine: learningsLineOf(getContentLearnings(uid)),
      styleRules,
      visualStyle,
    }), apiKey);
    res.json({ prompt });
  } catch (e) {
    console.error('[image-brief]', e.message);
    const isOpenAI = /^brief \d+/.test(e.message);
    res.status(isOpenAI ? 502 : 500).json({ error: 'No se pudo expandir el brief: ' + e.message.slice(0, 200) });
  }
});
// Genera una imagen de concepto nivel agencia con gpt-image-2.
// Con refs válidas (fotos del usuario) → images/edits (el MISMO producto, otra escena).
// Sin refs → images/generations (escena 100% sintética con la paleta del cliente).
// Motor de concept-shot como función reusable: brief expandido + imagen con
// gpt-image-2 + QA de visión (máx 1 reintento) + guardado. Devuelve el path
// público (/media/...). Lanza si falla (el llamador decide el status HTTP).
//
// PRE-GENERACIÓN: cuando el chat cierra una idea, el servidor arranca la imagen
// en background AHÍ MISMO (pregenIdeaImage). La tarjeta "IDEA LISTA" la levanta
// al instante con /api/ideas/pregen-image en vez de hacer esperar al cliente.
const PREGEN = new Map(); // key: uid + ':' + titulo -> {status, path, style, styleName, at}
function pregenKey(uid, titulo) { return String(uid) + '::' + String(titulo || '').slice(0, 80); }
function pregenIdeaImage(uid, idea) {
  try {
    const titulo = idea && (idea.titulo || idea.title);
    if (!titulo) return;
    const key = pregenKey(uid, titulo);
    if (PREGEN.has(key)) return; // ya en curso o lista
    PREGEN.set(key, { status: 'pending', at: Date.now() });
    const styleOut = {};
     conceptShotGenerateQueued({
      uid,
      idea: { titulo: idea.titulo || idea.title, angulo: idea.angulo || '', porque: idea.porque || '', tipo: idea.tipo || 'novedad' },
      tipo: idea.tipo || 'novedad',
      headline: String(titulo).slice(0, 80),
      refs: [],
      usedStyles: [],
      styleOut,
    }).then(path => {
      PREGEN.set(key, { status: 'done', path, style: styleOut.code || null, styleName: styleOut.name || '', at: Date.now() });
    }).catch(err => {
      PREGEN.set(key, { status: 'error', error: String((err && err.message) || '').slice(0, 200), at: Date.now() });
      try { logGenError('pregen', err); } catch (e2) {}
    });
    // Limpieza: tope de 50 entradas
    if (PREGEN.size > 50) { try { PREGEN.delete(PREGEN.keys().next().value); } catch (e) {} }
  } catch (e) { /* nunca romper el chat por la pre-generación */ }
}
app.post('/api/ideas/pregen-image', requireAuth, express.json(), (req, res) => {
  const e = PREGEN.get(pregenKey(req.session.userId, (req.body || {}).titulo));
  if (!e) return res.json({ ok: true, status: 'missing' });
  res.json({ ok: true, status: e.status, path: e.path || null, error: e.error || null });
});
// Cola por usuario: una sola generación de imagen a la vez. Evita el 429 de
// OpenAI cuando la pre-generación y el on-demand se pisan (o el usuario
// toca "Otra imagen" varias veces seguidas).
const GEN_QUEUE = new Map(); // uid -> Promise (la última encolada)
function conceptShotGenerateQueued(args) {
  const uid = args.uid;
  const prev = GEN_QUEUE.get(uid) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => conceptShotGenerateInner(args));
  const tracked = next.catch(() => {});
  GEN_QUEUE.set(uid, tracked);
  tracked.finally(() => { if (GEN_QUEUE.get(uid) === tracked) GEN_QUEUE.delete(uid); });
  return next;
}
async function conceptShotGenerateInner({ uid, idea, tipo, intent = null, headline, refs, apiKey, style = null, usedStyles = null, styleOut = null, restyle = false, refNoteOverride = null, productRef = null, extraPrompt = '' }) {
  costs.assertAiOk(uid); // kill-switch diario: tira AiCapExceeded (mensaje amable) si se superó el tope
  const ideaObj = parseIdea(idea);
  const settings = getSettings(uid);
  const key = apiKey || settings.openai_key || process.env.OPENAI_API_KEY || '';
  if (!key) throw new Error('Sin clave de OpenAI');
  const profile = getProfile(uid);
  const cleanHeadline = String(headline || '').trim();
  const hexes = parseBrandHexes(settings.brand_colors);
  const dna = readDna(uid);
  const theme = ideaObj.titulo || ideaObj.tema || '';
  const angle = ideaObj.porque || ideaObj.angulo || '';
  // Track D: style_rules también pesan en la estética (bloque delimitado en expandArtBrief).
  let styleRules = [];
  try { styleRules = db.prepare('SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1').all(uid).map(r => r.rule_text); } catch (e) {}
  // Style Lock visual: perfil estético del feed del cliente (si ya se analizó).
  let visualStyle = '', visualProfile = null;
  try { visualProfile = getVisualStyle(db, uid); visualStyle = visualStyleBlock(visualProfile); } catch (e) {}
  // Fallback automático: sin perfil y con IG conectado → analizar en background
  // (sin await, no bloquea la generación actual).
  if (!visualStyle) {
    try {
      const { getCreds } = require('./insights');
      if (getCreds(db, uid)) analyzeVisualStyle(db, uid).catch(() => {});
    } catch (e) {}
  }
  const briefBase = {
    headline: cleanHeadline,
    tipo: String(tipo || ''),
    angle,
    theme,
    businessName: profile.business_name,
    category: profile.category,
    paletteHex: hexes,
    dnaBits: dnaBitsLine(dna),
    learningsLine: learningsLineOf(getContentLearnings(uid)),
    styleRules,
    visualStyle,
  };
  // Niveles que se sienten (level-boosts): el nivel del usuario cambia REALMENTE
  // el payload que recibe el modelo. N1 = briefBase idéntico (baseline).
  const brief = levelBoosted(uid, 'image', briefBase);
  let prompt;
  try {
    prompt = await expandArtBrief(brief, key);
  } catch (e) {
    console.error('[concept-shot] brief:', e.message);
    throw new Error('No se pudo expandir el brief: ' + e.message);
  }
  // N4+: el Style Lock visual se verifica en el prompt de imagen (si la
  // generación lo ignora, el brand-check post-generación entra en retry).
  if (brief.styleLockVerify) prompt = `${prompt}\n\n${brief.styleLockVerify}`;
  // Estilos de imagen (image-styles.js): la INTENCIÓN viaja EXPLÍCITA desde el
  // generador. resolveExplicitIntent() la resuelve de lo que el generador YA
  // SABE (tipo determinista + refinamiento por keywords); el caller puede
  // pasar `intent` directo para forzarla. Precedencia en pickStyle: intent
  // explícito > keywords del tema/ángulo > intent desde tipo > default. El
  // fragmento va AL FINAL del prompt, DESPUÉS del Style Lock visual — la
  // paleta manda. Las reglas NEVER_STYLES filtran combinaciones prohibidas.
  let stylePick = null, styleFrag = '';
  // Learning loop: lo que rinde para ESTE cliente sube en el ranking
  // (solo reordena dentro de lo válido; jamás rompe brandSafe/NEVER_STYLES).
  let learnBoosts = {};
  try { learnBoosts = require('./learning').getClientBoosts(db, uid) || {}; } catch (e) {}
  try {
    const { INTENT_STYLES: IS, resolveExplicitIntent: rei } = require('./image-styles');
    const known = rei({ tipo: String(tipo || ''), theme, angle });
    const explicitIntent = (intent && IS[intent]) ? { intent, source: 'forced' } : known;
    stylePick = style
      ? { style: getStyle(style), reason: `estilo elegido manualmente (${style})`, intent: explicitIntent.intent || '', intentSource: explicitIntent.source === 'forced' ? 'explicit' : 'manual' }
      : pickStyle({ intent: explicitIntent.intent, tipo: String(tipo || ''), theme, angle, rubro: profile.category || '', businessName: profile.business_name || '', usedThisWeek: usedStyles, boosts: learnBoosts });
    if (stylePick && stylePick.style) {
      styleFrag = styleFragment(stylePick.style, hexes);
      if (Array.isArray(usedStyles) && !usedStyles.includes(stylePick.style.code)) usedStyles.push(stylePick.style.code);
      if (styleOut) {
        styleOut.code = stylePick.style.code;
        styleOut.name = stylePick.style.name || '';
        styleOut.reason = stylePick.reason;
        styleOut.intent = stylePick.intent || '';
      }
      console.log(`[style] ${stylePick.style.code} — ${stylePick.reason} (intent: ${stylePick.intent || '-'}${stylePick.intentSource ? `, src: ${stylePick.intentSource}` : ''})`);
    } else stylePick = null;
  } catch (e) { console.error('[style] pick falló:', e.message); stylePick = null; styleFrag = ''; }
  const withStyle = (p) => (styleFrag ? `${p}\n\n${styleFrag}` : p) + (extraPrompt ? `\n\n${extraPrompt}` : '');
  let absRefs = (refs || []).slice(0, 2)
    .map((fp) => path.join(MEDIA_DIR, path.basename(String(fp || ''))))
    .filter((p) => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; } });
  const userRefCount = absRefs.length;
  // Reference lock (producto consistente): la primera foto de producto de la
  // semana viaja como referencia para que el producto se vea IDÉNTICO en todos
  // los posteos. Solo si el caller no pasó refs propias.
  let refNote;
  if (productRef && !userRefCount) {
    const prp = path.join(MEDIA_DIR, path.basename(String(productRef)));
    try {
      if (fs.existsSync(prp) && fs.statSync(prp).isFile()) {
        absRefs = [prp, ...absRefs].slice(0, 3);
        refNote = 'IMPORTANT: the reference photo shows the client\'s REAL product — it must appear IDENTICAL in the new image (same shape, same colors, same packaging, same labels, same proportions). Do NOT redesign or reinterpret the product. Only change the scene/style around it.';
      }
    } catch (e) {}
  }
  // Style Lock: logo de marca del cliente — se sube UNA vez (asset kind='logo') y
  // va SIEMPRE como primera referencia: la marca sale idéntica en todos los posteos.
  // (refNote ya declarado arriba: el reference-lock de producto puede haberlo seteado.)
  let logoPresent = false;
  try {
    const logoRow = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'logo' ORDER BY id ASC LIMIT 1`).get(uid);
    const lfp = logoRow && String(logoRow.file_path || '').trim();
    if (lfp) {
      const lp = path.join(MEDIA_DIR, path.basename(lfp));
      if (fs.existsSync(lp) && fs.statSync(lp).isFile()) {
        absRefs = [lp, ...absRefs].slice(0, 3); // el logo va PRIMERO, máx 3 refs totales
        logoPresent = true;
      }
    }
  } catch (e) {}
  // Boost N2 (level-boosts): si el llamador no pasó refs explícitas, las fotos
  // REALES del cliente tienen prioridad como referencia (no banco genérico).
  // El logo de marca sigue primero (Style Lock); las fotos van después.
  if (!userRefCount && brief.photoRefs && brief.photoRefs.length && absRefs.length < 3) {
    const fill = brief.photoRefs
      .map((fp) => path.join(MEDIA_DIR, path.basename(String(fp || ''))))
      .filter((p) => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; } });
    if (fill.length) {
      absRefs = [...absRefs, ...fill].slice(0, 3);
      if (!refNote) refNote = 'IMPORTANT: the reference photos are the client\'s REAL photos — keep the same products, people and places recognizable (same look, same photographic style), in a new scene. Never a generic stock look.';
    }
  }
  if (logoPresent) {
    refNote = 'IMPORTANT: the FIRST reference image is the client\'s brand logo — it must appear IDENTICAL (same design, same colors, same art style), as the protagonist or clearly visible, in a new scene. Do NOT redesign or reinterpret it.';
  } else if (visualProfile && visualProfile.subject_always_present && Array.isArray(visualProfile.ref_paths) && visualProfile.ref_paths.length && absRefs.length < 3) {
    // Style Lock visual: si un sujeto/personaje aparece en todos los posteos del
    // feed, sumar refs del feed (hasta completar 3 refs totales) para que el
    // generador lo mantenga reconocible en la nueva escena.
    const feedRefs = visualProfile.ref_paths.filter((p) => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; } });
    if (feedRefs.length) {
      absRefs = [...absRefs, ...feedRefs].slice(0, 3);
      refNote = 'IMPORTANT: keep the SAME recurring subject/character from the reference photos (it appears in every post of this client), recognizable and consistent, in a new scene.';
    }
  }
  // MODO RESTYLE: la foto del cliente es la protagonista — el MISMO producto,
  // solo cambia el estilo. Pisa cualquier refNote anterior (incluso el logo:
  // en restyle la foto base manda).
  if (restyle) {
    refNote = refNoteOverride || 'IMPORTANT: keep the EXACT same product/subject from the reference photo — identical shape, colors, packaging, labels, details and proportions. Do NOT invent a different product, do NOT redesign it. ONLY change the photographic style, lighting and scene as directed.';
  } else if (refNoteOverride) {
    refNote = refNoteOverride;
  }
  let b64;
  try {
    b64 = await genConceptImage(key, withStyle(prompt), absRefs, refNote, uid);
  } catch (e) {
    console.error('[concept-shot] openai:', e.message);
    throw new Error('OpenAI no pudo generar la imagen: ' + e.message);
  }
  // QA de visión DESACTIVADO (2026-10-02): causaba timeouts (hasta 6 reintentos
  // encadenados = 15 min). Se genera una vez y se entrega. El usuario puede
  // tocar "Otro estilo" si no le gusta.
  // QA de visión en MODO AUDITORÍA (2026-10-04): valida pero NO regenera.
  // El 2026-10-02 se desactivó porque los reintentos encadenados causaban
  // timeouts (hasta 6 reintentos = 15 min por imagen). En auditoría no hay
  // reintentos: se corre el QA una sola vez, se registra el resultado en
  // qa_audit, y la imagen se entrega igual. Mora (11:00) lee esa tabla y
  // convierte cada defecto en una regla del pipeline.
  let qa = null;
  try {
    qa = await qaImageB64(b64, {
      headline: cleanHeadline,
      paletteHex: hexes,
      dnaFacts: qaFactsLine(dna),
    }, key);
  } catch (e) { console.error('[concept-shot] qa:', e.message); }
  if (qa) {
    const qaPassed = !!(qa.texto_ok && qa.colores_ok && qa.claims_ok && qa.mobile_ok && qa.brand_ok && qa.anatomia_ok && qa.headline_clear !== false);
    try { console.log(('[qa-audit] passed=' + qaPassed + ' ' + JSON.stringify({texto: qa.texto_ok, colores: qa.colores_ok, claims: qa.claims_ok, mobile: qa.mobile_ok, marca: qa.brand_ok, anatomia: qa.anatomia_ok, headline_clear: qa.headline_clear, detalle: qa.detalle})).slice(0, 600)); } catch (e) {}
    try {
      db.exec("CREATE TABLE IF NOT EXISTS qa_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT (datetime('now')), passed INTEGER, result TEXT)");
      db.prepare('INSERT INTO qa_audit (passed, result) VALUES (?, ?)').run(qaPassed ? 1 : 0, JSON.stringify(qa).slice(0, 4000));
    } catch (e) { console.error('[qa-audit] db:', e.message); }
  }
  // Chequeo automático de marca (Style Lock): DESACTIVADO (2026-10-02, causa timeouts).
  /*
  // línea visual. Si algún flag es false → regenerar pidiendo explícitamente lo
  // que falló (máx 2 reintentos). Si el chequeo falla por red/API → se acepta
  // la imagen (nunca bloquea). refNote viaja en las regeneraciones igual que el QA.
  for (let bcTry = 0; bcTry < 2; bcTry++) {
    let bc = null;
    try {
      bc = await qaBrandB64(b64, { paletteHex: hexes, logoPresent, visualBlock: visualStyle }, key);
    } catch (e) { console.error('[brand-check] error:', e.message); }
    if (!bc) break; // fallo de red/API o JSON ilegible: se acepta la imagen, no bloquea
    console.log('[brand-check]', JSON.stringify(bc));
    if (bc.paleta_ok && bc.logo_ok && bc.linea_ok) break;
    const fixes = [];
    if (!bc.paleta_ok) fixes.push(`use EXACTLY these brand colors (${hexes.join(', ') || 'the client palette'}) INTEGRATED into the scene (props, wardrobe, packaging, environment details) — never as a flat background`);
    if (!bc.logo_ok) fixes.push('the client\'s brand logo (FIRST reference image) must appear IDENTICAL — same design, same colors, same art style, no deformations, no redesign, no reinterpretation');
    if (!bc.linea_ok) fixes.push(`respect the client's visual line exactly${visualStyle ? ': ' + String(visualStyle).slice(0, 200) : ''}`);
    try {
      b64 = await genConceptImage(key, withStyle(prompt + `\nIMPORTANT FIX (brand check failed: ${bc.detalle || 'brand mismatch'}): ${fixes.join(' ')}. Regenerate fixing exactly that, keeping everything else the same.`), absRefs, refNote, uid);
      console.log(`[brand-check] regeneración ${bcTry + 1} generada`);
    } catch (e) {
      console.error('[brand-check] regeneración falló, devuelvo la última imagen:', e.message);
      break;
    }
  }
  */
  // QA visual extendido DESACTIVADO (2026-10-02, causa timeouts).
  /*
  // anti-duplicado visual de 7 días. Se avisa en el log y se regenera una vez;
  // si la regeneración falla, se entrega la última imagen (no se pierde el trabajo).
  if (!qaResolutionOk(b64)) {
    console.log('[concept-shot] resolución bajo el mínimo: aviso en 1 línea y ofrezco alternativa (regenerar)');
    try { b64 = await genConceptImage(key, withStyle(prompt), absRefs, refNote, uid); } catch (e) { console.error('[concept-shot] regen resolución:', e.message); }
  }
  if (!qaAspectOk(b64, QA_ASPECT_45)) {
    console.log('[concept-shot] aspect ratio distinto al formato pedido (4:5): regenero');
    try { b64 = await genConceptImage(key, withStyle(prompt + '\nIMPORTANT: strict vertical 4:5 aspect ratio.'), absRefs, refNote, uid); } catch (e) { console.error('[concept-shot] regen aspecto:', e.message); }
  }
  const dedupe = qaDedupe7d(uid, cleanHeadline || theme);
  if (!dedupe.ok) {
    console.log(`[concept-shot] comparación visual: posible duplicado de los últimos 7 días ("${dedupe.caption}"), cambio la propuesta`);
    try { b64 = await genConceptImage(key, withStyle(prompt + `\nIMPORTANT: differentiate clearly from this recent post of the same business: "${dedupe.caption}". Different scene, different composition, different angle.`), absRefs, refNote, uid); } catch (e) { console.error('[concept-shot] regen dedupe:', e.message); }
  }
  */
  const imgName = saveImageB64(b64);
  // Componer el titular con código (si hay): la imagen sale limpia de la IA
  // y el texto se renderiza perfecto — siempre entra, nunca se recorta.
  if (cleanHeadline) {
    try {
      const { execFileSync } = require('child_process');
      const imgPath = path.join(MEDIA_DIR, imgName);
      execFileSync('python3', [
        path.join(__dirname, 'composite-headline.py'),
        '--in', imgPath,
        '--headline', cleanHeadline,
        '--out', imgPath,
      ], { timeout: 30000 });
      console.log(`[concept-shot] titular compuesto: "${cleanHeadline.slice(0, 40)}"`);
    } catch (e) {
      console.error('[concept-shot] composite titular falló, sigo con imagen limpia:', e.message);
    }
  }
  return `/media/${imgName}`;
}

// generateCarouselSet — carousel automático: portada canvas (scroll-stop) +
// 3 placas IA (una idea cada una). La portada usa brand-card.py (gratis,
// instantánea) con QA determinístico de contraste/miniatura; cada placa pasa
// scroll-stop QA de visión con 1 reintento. Devuelve
// { coverPath, slidePaths, caption, scrollScore, needsReview }.
// Lanza si no se puede armar (el llamador cae a imagen simple).
async function generateCarouselSet({ uid, idea, tipo, caption, key, usedStyles }) {
  if (!splitCarouselSlides) throw new Error('carousel no disponible');
  costs.assertAiOk(uid);
  const settings = getSettings(uid);
  const profile = getProfile(uid) || {};
  const apiKey = key || settings.openai_key || process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new Error('Sin clave de OpenAI');
  const titulo = String(idea.titulo || idea.tema || '');
  const porque = String(idea.porque || idea.angulo || '');
  const split = await splitCarouselSlides({ titulo, porque, caption }, apiKey);
  if (!split) throw new Error('no se pudo partir la idea en placas');
  const bgHex = primaryBrandHex(uid) || '#0A1E33';
  const business = profile.business_name || '';
  let logoAbs = null;
  try { logoAbs = logoAbsPath(uid); } catch (e) {}
  let needsReview = false;
  // --- Portada: brand-card.py + QA determinístico (contraste + miniatura) ---
  let coverPath = null, coverTries = 0, coverBg = bgHex, coverText = '#FFFFFF';
  while (coverTries < 3 && !coverPath) {
    coverTries++;
    try {
      const abs = brandCardPng({ headline: split.cover, bgHex: coverBg, textHex: coverText, business, logoAbs, photoAbs: null, outDir: MEDIA_DIR });
      const words = split.cover.trim().split(/\s+/).length;
      const fontEst = words <= 4 ? 104 : words <= 7 ? 80 : 56;
      const qa = scoreCanvasCover ? scoreCanvasCover({ headline: split.cover, textHex: coverText, bgHex: coverBg, fontPx: fontEst, canvasW: 1080 }) : { score: 100, pass: true, fixes: [] };
      console.log(`[carousel] portada QA determinístico: score=${qa.score} (intento ${coverTries})`);
      if (qa.pass || coverTries >= 3) {
        if (!qa.pass) { needsReview = true; console.log('[carousel] portada bajo el mínimo tras 3 intentos → needs_review'); }
        coverPath = '/media/' + path.basename(abs);
      } else {
        // Ajuste: forzar máximo contraste (texto blanco sobre navy).
        coverBg = '#0A1E33'; coverText = '#FFFFFF';
      }
    } catch (e) { console.error('[carousel] portada falló:', e.message); }
  }
  if (!coverPath) throw new Error('no se pudo renderizar la portada');
  // --- Placas: una foto IA por punto, con scroll-stop QA de visión ---
  const slidePaths = [];
  let coverScoreSum = 0;
  const slideJobs = split.slides.map((s, idx) => (async () => {
    const styleOut = {};
    let extraPrompt = '';
    let p = null, sScore = 0, sOk = false;
    for (let attempt = 0; attempt < 2 && !sOk; attempt++) {
      try {
        p = await conceptShotGenerateQueued({
          uid, idea: { titulo: `${titulo}: ${s.title}`, porque: s.text }, tipo,
          headline: '', refs: [], apiKey, usedStyles, styleOut, extraPrompt: extraPrompt || undefined,
        });
        // Scroll-stop QA de visión sobre la placa generada.
        if (qaScrollStopB64) {
          const abs = path.join(MEDIA_DIR, path.basename(String(p)));
          let b64 = null;
          try { b64 = fs.readFileSync(abs).toString('base64'); } catch (e) {}
          const qa = b64 ? await qaScrollStopB64(b64, apiKey) : null;
          if (qa) {
            sScore = qa.score;
            console.log(`[carousel] placa ${idx + 1} scroll-stop: score=${qa.score} (intento ${attempt + 1})`);
            if (qa.pass) { sOk = true; break; }
            extraPrompt = `SCROLL-STOP FIX: ${qa.fixes.join(' ')}. Regenerate as a high-impact Instagram image that stops the scroll in half a second.`;
          } else { sOk = true; } // QA no disponible: se acepta la placa
        } else { sOk = true; }
      } catch (e) { console.error(`[carousel] placa ${idx + 1} falló:`, e.message); break; }
    }
    return { path: p, score: sScore, ok: !!p };
  })());
  const slideResults = await Promise.all(slideJobs);
  for (const r of slideResults) {
    if (r.path) { slidePaths.push(r.path); coverScoreSum += r.score; }
  }
  if (!slidePaths.length) throw new Error('no se pudo generar ninguna placa');
  if (slidePaths.length < split.slides.length) needsReview = true;
  const avgSlideScore = slidePaths.length ? Math.round(coverScoreSum / slidePaths.length) : 0;
  const finalCaption = buildCarouselCaption(caption);
  console.log(`[carousel] usuario ${uid}: portada + ${slidePaths.length} placas, score placas≈${avgSlideScore}, needsReview=${needsReview}`);
  return { coverPath, slidePaths, caption: finalCaption, scrollScore: avgSlideScore, needsReview };
}

// Diagnóstico de generación de imagen (solo fundador, por sesión).
// Prueba la llamada directa a OpenAI y devuelve el error exacto.
// Ejecuta el sweep semanal manualmente (solo fundador). Genera la semana
// entrante sin esperar al domingo 07:00. Idempotente por week_key.
app.post('/api/diag/run-sweep', requireAuth, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    let isFounder = false;
    try { isFounder = !!(costs.isFounderEmail && costs.isFounderEmail(uid)); } catch (e) {}
    if (!isFounder) return res.status(403).json({ ok: false, error: 'no autorizado' });
    const r = await nextWeekSweep();
    res.json({ ok: true, result: r });
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e).slice(0, 200) });
  }
});

app.post('/api/diag/image-test', requireAuth, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    let isFounder = false;
    try { isFounder = !!(costs.isFounderEmail && costs.isFounderEmail(uid)); } catch (e) {}
    if (!isFounder) return res.status(403).json({ ok: false, error: 'no autorizado' });
    const key = process.env.OPENAI_API_KEY || '';
    const diag = { hasKey: !!key, keyPrefix: key ? key.slice(0, 7) + '...' : null };
    if (!key) return res.json({ ok: false, diag, error: 'Sin OPENAI_API_KEY en el servidor' });
    // Llamada mínima a gpt-image-2
    let r;
    try {
      r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-image-2', prompt: 'A simple red circle on white background', size: '1024x1024', quality: 'low' }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      diag.fetchError = String(e.message || e).slice(0, 200);
      return res.json({ ok: false, diag, error: 'Error de red a OpenAI: ' + diag.fetchError });
    }
    diag.httpStatus = r.status;
    const bodyText = await r.text().catch(() => '');
    diag.bodyPreview = bodyText.slice(0, 300);
    if (!r.ok) {
      return res.json({ ok: false, diag, error: `OpenAI devolvió ${r.status}: ${bodyText.slice(0, 200)}` });
    }
    let data;
    try { data = JSON.parse(bodyText); } catch (e) {
      return res.json({ ok: false, diag, error: 'OpenAI devolvió JSON inválido' });
    }
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    diag.hasB64 = !!b64;
    diag.b64Len = b64 ? b64.length : 0;
    if (!b64) return res.json({ ok: false, diag, error: 'OpenAI no devolvió b64_json' });
    return res.json({ ok: true, diag });
  } catch (e) {
    return res.json({ ok: false, error: 'Excepción: ' + String(e.message || e).slice(0, 200) });
  }
});

// Diagnóstico de la generación semanal (2026-10-07): chequea TODOS los gates
// que pueden trabar el "armando tu semana" y devuelve el motivo exacto.
// Solo fundador.
app.post('/api/diag/week-test', requireAuth, express.json(), async (req, res) => {
  const uid = req.session.userId;
  const diag = {};
  try {
    try { diag.founder = !!(costs.isFounderEmail && costs.isFounderEmail(uid)); } catch (e) { diag.founder = false; }
    if (!diag.founder) return res.status(403).json({ ok: false, error: 'no autorizado' });
    // Gate 1: plan/trial
    try { diag.planOk = planOrTrialOk(uid); } catch (e) { diag.planOk = false; diag.planErr = e.message; }
    // Gate 2: AI cap
    try { costs.assertAiOk(uid); diag.aiOk = true; }
    catch (e) { diag.aiOk = false; diag.aiErr = String(e.message || e).slice(0, 200); diag.aiName = e.name; }
    // Gate 3: DNA
    try {
      const profile = getProfile(uid);
      const dna = readDna(uid);
      diag.descLen = (profile.description || '').trim().length;
      diag.productoLen = (dna.producto_estrella || '').trim().length;
      diag.dnaOk = diag.descLen >= 20 || diag.productoLen >= 3;
    } catch (e) { diag.dnaOk = false; diag.dnaErr = e.message; }
    // Gate 4: posts existentes
    try {
      const tz = userTz(uid);
      const wk = mondayKeyOf(tzToday(tz));
      diag.weekKey = wk;
      diag.existing = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ? AND status IN ('draft','scheduled')`).get(uid, wk).n || 0;
      // 2026-10-08: detalle de imágenes (Valentino reporta que no aparecen).
      try {
        const rows = db.prepare(`SELECT id, image_path, needs_review FROM posts WHERE user_id = ? AND week_key = ? AND status IN ('draft','scheduled') ORDER BY id DESC LIMIT 5`).all(uid, wk);
        diag.posts = rows.map(r => ({
          id: r.id,
          hasImage: !!(r.image_path && String(r.image_path).trim()),
          imagePath: String(r.image_path || '').slice(0, 80),
          needsReview: r.needs_review || 0,
        }));
        diag.withoutImage = diag.posts.filter(p => !p.hasImage).length;
      } catch (e) { diag.postsErr = e.message; }
    } catch (e) { diag.existing = -1; diag.existingErr = e.message; }
    // Gate 5: NEXTWEEK_RUNNING
    diag.running = nextweekRunningFresh(uid);
    // Gate 6: OpenAI key
    const key = openaiKeyFor(uid) || process.env.OPENAI_API_KEY || '';
    diag.hasKey = !!key;
    // Gate 7: probar generateIdeas (1 llamada real, EN MODO ESTRICTO como el pipeline)
    if (diag.planOk && diag.aiOk && diag.dnaOk && diag.hasKey) {
      try {
        const ideas = await generateIdeas(ideasInputFor(uid), key, { strict: true });
        diag.ideasOk = true;
        diag.ideasCount = (ideas || []).length;
        // Gate 8: probar generación de imagen (1 imagen de prueba, la causa más probable)
        if (diag.ideasOk && ideas.length > 0) {
          try {
            const testIdea = ideas[0];
            const imgPath = await conceptShotGenerateQueued({
              uid,
              idea: testIdea.titulo || 'test',
              tipo: testIdea.tipo || 'tip',
              headline: '',
              refs: [],
            });
            diag.imageOk = true;
            diag.imagePath = String(imgPath || '').slice(0, 80);
            // Limpiar la imagen de prueba (no ensuciar la semana)
            try {
              if (imgPath && imgPath.startsWith('/media/')) {
                const fs = require('fs');
                const path = require('path');
                const full = path.join(MEDIA_DIR, path.basename(imgPath));
                if (fs.existsSync(full)) fs.unlinkSync(full);
              }
            } catch (e) {}
          } catch (e) {
            diag.imageOk = false;
            diag.imageErr = String(e.message || e).slice(0, 300);
          }
        }
      } catch (e) {
        diag.ideasOk = false;
        diag.ideasErr = String(e.message || e).slice(0, 300);
      }
    }
    return res.json({ ok: true, diag });
  } catch (e) {
    return res.json({ ok: false, error: String(e.message || e).slice(0, 200), diag });
  }
});

app.post('/api/concept-shot', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    // Diagnóstico temporal (2026-10-04): exponer por qué falla la generación.
    const diag = { founder: false, aiOk: true, rateOk: true };
    try { diag.founder = !!(costs.isFounderEmail && costs.isFounderEmail(uid)); } catch (e) {}
    try { costs.assertAiOk(uid); }
    catch (e) {
      diag.aiOk = false;
      if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message, diag });
      throw e;
    }
    // Límite diario de regeneraciones por plan (2026-10-02): 3/5/8 (Esencial/Pro/Total).
    const rateRes = costs.checkRate(uid, 'regen', aiLimitsFor(uid).regensPerDay);
    diag.rateOk = !!rateRes.ok;
    diag.rateUsed = rateRes.used;
    if (!rateRes.ok)
      return res.json({ ok: false, error: costs.MSG_REGEN_RATE, diag });
    const { idea = '', tipo = '', headline = '', refs = [], style = '', excludeStyles = [] } = req.body || {};
    const styleOut = {};
    const imagePath = await conceptShotGenerateQueued({ uid, idea, tipo, headline, refs, style: String(style || '').trim() || null, usedStyles: Array.isArray(excludeStyles) ? excludeStyles.slice() : null, styleOut });
    console.log(`[concept-shot] generado para usuario ${uid} (tipo=${tipo || '-'}, refs=${(refs || []).length}, estilo=${styleOut.code || '-'})`);
    res.json({ ok: true, path: imagePath, style: styleOut.code || null, styleName: styleOut.name || null });
  } catch (e) {
    console.error('[concept-shot]', e.message);
    try { logGenError('concept-shot', e); } catch (e2) {}
    if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message });
    if (String(e.message || '').startsWith('Sin clave')) return res.status(400).json({ error: e.message });
    res.status(502).json({ error: String(e.message || 'No se pudo generar la imagen').slice(0, 200) });
  }
});

// Estilos de imagen disponibles (para el picker "✨ Estilo" en borradores).
app.get('/api/image-styles', requireAuth, (req, res) => {
  try { res.json({ ok: true, styles: listStyles() }); }
  catch (e) { res.json({ ok: true, styles: [] }); }
});

// Regenerar SOLO la foto de un borrador con un estilo elegido (picker "✨ Estilo").
// Mantiene caption, hashtags y horario: solo cambia la imagen.
app.post('/api/drafts/:id/photo-style', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    try { costs.assertAiOk(uid); }
    catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message }); throw e; }
    if (!costs.checkRate(uid, 'regen', aiLimitsFor(uid).regensPerDay).ok)
      return res.json({ ok: false, error: costs.MSG_REGEN_RATE });
    const postId = Number(req.params.id);
    const { style = '' } = req.body || {};
    const st = getStyle(style);
    if (!postId || !st) return res.status(400).json({ ok: false, error: 'Estilo inválido' });
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(postId, uid);
    if (!post || (post.status !== 'draft' && post.status !== 'scheduled'))
      return res.status(404).json({ ok: false, error: 'Borrador no encontrado' });
    const headline = makeHeadline(String(post.caption || '').split('\n')[0], 6) || '';
    const styleOut = {};
    const newPath = await conceptShotGenerateQueued({
      uid, idea: String(post.caption || ''), tipo: post.tipo || '', headline, refs: [], style: st.code, styleOut,
    });
    if (!newPath) throw new Error('sin imagen');
    db.prepare('UPDATE posts SET image_path = ?, style_code = ?, style_reason = ?, intent = ? WHERE id = ?')
      .run(String(newPath), st.code, String(styleOut.reason || ''), String(styleOut.intent || ''), postId);
    res.json({ ok: true, path: newPath, style: st.code, reason: styleOut.reason || '' });
  } catch (e) {
    console.error('[photo-style]', e.message);
    if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message });
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo regenerar la foto').slice(0, 200) });
  }
});

// Restylear la foto ACTUAL de un borrador con un estilo elegido ("🎨 Restylear
// mi foto"). A diferencia de /photo-style (que genera una foto nueva), acá la
// foto del cliente es la BASE: gpt-image-2 EDITS mantiene el MISMO producto,
// solo cambia el estilo. Mantiene caption, hashtags y horario.
app.post('/api/drafts/:id/photo-restyle', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    try { costs.assertAiOk(uid); }
    catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message }); throw e; }
    if (!costs.checkRate(uid, 'regen', aiLimitsFor(uid).regensPerDay).ok)
      return res.json({ ok: false, error: costs.MSG_REGEN_RATE });
    const postId = Number(req.params.id);
    const { style = '' } = req.body || {};
    const st = getStyle(style);
    if (!postId || !st) return res.status(400).json({ ok: false, error: 'Estilo inválido' });
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(postId, uid);
    if (!post || (post.status !== 'draft' && post.status !== 'scheduled'))
      return res.status(404).json({ ok: false, error: 'Borrador no encontrado' });
    const basePath = String(post.image_path || '');
    const absBase = basePath.startsWith('/media/') ? path.join(MEDIA_DIR, path.basename(basePath)) : null;
    if (!absBase || !fs.existsSync(absBase))
      return res.status(400).json({ ok: false, error: 'El borrador no tiene foto para restylear' });
    const headline = makeHeadline(String(post.caption || '').split('\n')[0], 6) || '';
    const styleOut = {};
    const newPath = await conceptShotGenerateQueued({
      uid, idea: String(post.caption || ''), tipo: post.tipo || '', headline,
      refs: [basePath], style: st.code, styleOut, restyle: true,
    });
    if (!newPath) throw new Error('sin imagen');
    db.prepare(`UPDATE posts SET image_path = ?, style_code = ?, style_reason = ?, intent = ?,
      source_topic = COALESCE(NULLIF(source_topic,''), 'restyle') WHERE id = ?`)
      .run(String(newPath), st.code, `restyle de tu foto con ${st.code}`, String(styleOut.intent || ''), postId);
    res.json({ ok: true, path: newPath, style: st.code });
  } catch (e) {
    console.error('[photo-restyle]', e.message);
    if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message });
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo restylear la foto').slice(0, 200) });
  }
});

// "✨ Mejorar foto": rescate de fotos mediocres. Un tap → gpt-image-2 EDITS
// arregla luz, balance de blancos, exposición y nitidez MANTENIENDO la misma
// foto (misma composición, mismos sujetos). Sin brief, sin vueltas.
app.post('/api/drafts/:id/photo-enhance', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    try { costs.assertAiOk(uid); }
    catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message }); throw e; }
    if (!costs.checkRate(uid, 'regen', aiLimitsFor(uid).regensPerDay).ok)
      return res.json({ ok: false, error: costs.MSG_REGEN_RATE });
    const postId = Number(req.params.id);
    if (!postId) return res.status(400).json({ ok: false, error: 'Borrador inválido' });
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(postId, uid);
    if (!post || (post.status !== 'draft' && post.status !== 'scheduled'))
      return res.status(404).json({ ok: false, error: 'Borrador no encontrado' });
    const basePath = String(post.image_path || '');
    const absBase = basePath.startsWith('/media/') ? path.join(MEDIA_DIR, path.basename(basePath)) : null;
    if (!absBase || !fs.existsSync(absBase))
      return res.status(400).json({ ok: false, error: 'El borrador no tiene foto para mejorar' });
    const settings = getSettings(uid);
    const apiKey = settings.openai_key || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ ok: false, error: 'Sin clave de OpenAI' });
    const b64 = await genConceptImage(apiKey,
      'Enhance this photo professionally: fix lighting, white balance, exposure, sharpness and contrast. Keep the EXACT same composition, subjects, framing and colors — it must remain recognizably the SAME photo, just professionally finished. Do not add, remove or move anything.',
      [absBase], null, uid);
    const newPath = `/media/${saveImageB64(b64)}`;
    db.prepare('UPDATE posts SET image_path = ? WHERE id = ?').run(String(newPath), postId);
    res.json({ ok: true, path: newPath });
  } catch (e) {
    console.error('[photo-enhance]', e.message);
    if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message });
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo mejorar la foto').slice(0, 200) });
  }
});

// ---------------------------------------------------------------------------
// Posty dogfood: Posty como su propio primer cliente.
// GET /api/dogfood/pending → la propuesta de hoy (o null).
// POST /api/dogfood/:id/approve → publica por el pipeline existente.
// POST /api/dogfood/:id/dismiss → la descarta (mañana se genera otra).
// ---------------------------------------------------------------------------
app.get('/api/dogfood/pending', requireAuth, async (req, res) => {
  try {
    const p = dogfood.getPendingDogfood(db, req.session.userId);
    res.json({ post: p || null });
  } catch (e) {
    res.status(500).json({ post: null });
  }
});
app.post('/api/dogfood/:id/approve', requireAuth, express.json(), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!postId) return res.status(400).json({ ok: false, error: 'Propuesta inválida' });
    const p = db.prepare(`SELECT * FROM posts WHERE id = ? AND user_id = ? AND kind = 'dogfood'`).get(postId, req.session.userId);
    if (!p) return res.status(404).json({ ok: false, error: 'Propuesta no encontrada' });
    const r = await dogfood.approveDogfood(db, postId, (d, post) => publishSinglePost(d, post, { house: true }));
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  } catch (e) {
    console.error('[dogfood/approve]', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo publicar' });
  }
});
app.post('/api/dogfood/:id/dismiss', requireAuth, express.json(), async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!postId) return res.status(400).json({ ok: false, error: 'Propuesta inválida' });
    const p = db.prepare(`SELECT * FROM posts WHERE id = ? AND user_id = ? AND kind = 'dogfood'`).get(postId, req.session.userId);
    if (!p) return res.status(404).json({ ok: false, error: 'Propuesta no encontrada' });
    res.json(dogfood.dismissDogfood(db, postId));
  } catch (e) {
    console.error('[dogfood/dismiss]', e.message);
    res.status(500).json({ ok: false, error: 'No se pudo descartar' });
  }
});

// Posty dogfood por email: los botones del email usan links firmados de un
// solo uso (HMAC, 24h). Sin login: el token es la autenticación. El token se
// invalida al usarse (anti-doble-click) y el approve usa el claim atómico
// anti-doble-publicación.
app.get('/api/dogfood/email-approve', async (req, res) => {
  try {
    const r = await dogfood.redeemDogfoodEmailToken(db, req.query.token, 'approve',
      (d, post) => publishSinglePost(d, post, { house: true }));
    res.status(200).send(r.html);
  } catch (e) {
    console.error('[dogfood/email-approve]', e.message);
    res.status(200).send(dogfoodEmailResultPageFallback());
  }
});
app.get('/api/dogfood/email-dismiss', async (req, res) => {
  try {
    const r = await dogfood.redeemDogfoodEmailToken(db, req.query.token, 'dismiss', null);
    res.status(200).send(r.html);
  } catch (e) {
    console.error('[dogfood/email-dismiss]', e.message);
    res.status(200).send(dogfoodEmailResultPageFallback());
  }
});
function dogfoodEmailResultPageFallback() {
  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Posty</title></head><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#47617A"><h1>🤔</h1><p>Algo salió mal. Abrí la app de Posty para ver tu propuesta de hoy.</p></body></html>';
}

// Historias automáticas: genera una story 1080×1920 (draft) del tipo pedido.
// Tipos: poll | question | countdown | repost. Render con brand-card.py
// (paleta del cliente). La publicación usa el flujo normal de stories.
app.post('/api/story-generate', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    const { type = 'poll', pollA = '', pollB = '', question = '', promoTitle = '', eventDate = '' } = req.body || {};
    const S = require('./stories');
    if (!S.STORY_TYPES.includes(type)) return res.status(400).json({ ok: false, error: 'Tipo de story inválido' });
    const profile = getProfile(uid) || {};
    const business = profile.business_name || '';
    const brand = {
      business, bgHex: primaryBrandHex(uid) || '#0A1E33', textHex: '#FFFFFF',
      logoAbs: (() => { try { return logoAbsPath(uid); } catch (e) { return null; } })(),
    };
    // Contexto: último post del día (para repost).
    let postCaption = '', postImageAbs = null;
    try {
      const p = db.prepare(
        `SELECT caption, image_path FROM posts WHERE user_id = ? AND media_type = 'image'
         AND date(created_at) = date('now') ORDER BY id DESC LIMIT 1`).get(uid);
      if (p) {
        postCaption = String(p.caption || '').split('\n')[0];
        const abs = p.image_path && p.image_path.startsWith('/media/')
          ? path.join(MEDIA_DIR, path.basename(p.image_path)) : null;
        if (abs && fs.existsSync(abs)) postImageAbs = abs;
      }
    } catch (e) {}
    const ctx = { business, postCaption, postImageAbs, pollA, pollB, question, promoTitle, eventDate };
    const out = S.generateStory({ db, uid, type, ctx, brand, mediaDir: MEDIA_DIR, scheduleAt: null });
    res.json({ ok: true, id: out.id, path: out.path, type });
  } catch (e) {
    console.error('[story-generate]', e.message);
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo generar la story').slice(0, 200) });
  }
});

// Community: cola de aprobación de respuestas a comentarios.
// NUNCA se envía sin aprobación explícita del cliente.
app.get('/api/community/pending', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const C = require('./community');
    res.json({ ok: true, items: C.getPendingReplies(db, uid, 50) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Aprobar + enviar una respuesta a Instagram.
app.post('/api/community/reply', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    const id = Number((req.body || {}).id);
    if (!id) return res.status(400).json({ ok: false, error: 'Id inválido' });
    const C = require('./community');
    const st = getSettings(uid) || {};
    const creds = { igUserId: st.ig_user_id, accessToken: st.ig_access_token };
    if (!creds.igUserId || !creds.accessToken)
      return res.status(400).json({ ok: false, error: 'Conectá tu Instagram en Ajustes' });
    const out = await C.approveAndSend(db, id, uid, { creds });
    res.json({ ok: true, igId: out.igId });
  } catch (e) {
    console.error('[community-reply]', e.message);
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo enviar').slice(0, 200) });
  }
});

// Descartar una respuesta propuesta (no se envía nada).
app.post('/api/community/dismiss', requireAuth, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    const id = Number((req.body || {}).id);
    if (!id) return res.status(400).json({ ok: false, error: 'Id inválido' });
    const C = require('./community');
    res.json(C.dismissReply(db, id, uid));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// "🎠 Hacer carousel": convierte un borrador en carousel automático — portada
// scroll-stop + 3 placas IA. El post pasa a media_type='carousel'.
app.post('/api/carousel-generate', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    try { costs.assertAiOk(uid); }
    catch (e) { if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message }); throw e; }
    const { postId = null } = req.body || {};
    const pid = Number(postId);
    if (!pid) return res.status(400).json({ ok: false, error: 'Borrador inválido' });
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(pid, uid);
    if (!post || (post.status !== 'draft' && post.status !== 'scheduled'))
      return res.status(404).json({ ok: false, error: 'Borrador no encontrado' });
    if (post.media_type === 'carousel')
      return res.json({ ok: true, already: true, paths: JSON.parse(post.carousel_paths || '[]') });
    const usedStyles = [];
    const gen = await generateCarouselSet({
      uid,
      idea: { titulo: post.source_topic || post.caption || '', porque: post.source_angle || '' },
      tipo: post.tipo || '', caption: post.caption || '', key: openaiKeyFor(uid), usedStyles,
    });
    const paths = [gen.coverPath, ...gen.slidePaths].slice(0, 5);
    db.prepare(`UPDATE posts SET media_type = 'carousel', carousel_paths = ?, image_path = ?,
      caption = ?, needs_review = ?, style_code = 'carousel' WHERE id = ?`)
      .run(JSON.stringify(paths), gen.coverPath, gen.caption, gen.needsReview ? 1 : 0, pid);
    res.json({ ok: true, paths, cover: gen.coverPath, needsReview: gen.needsReview });
  } catch (e) {
    console.error('[carousel-generate]', e.message);
    if (e && e.name === 'AiCapExceeded') return res.json({ ok: false, capped: true, error: e.message });
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo armar el carousel').slice(0, 200) });
  }
});

// Reels automáticos (reels.js): Ken Burns + headline animado, 1080×1920, sin audio.
// Máx 2 por semana (costo de generación). Nunca devuelve 500 sin mensaje claro.
app.post('/api/reel-generate', requireAuth, requireTrialValid, express.json(), async (req, res) => {
  const uid = req.session.userId;
  try {
    const R = require('./reels');
    if (!R.ffmpegAvailable())
      return res.status(503).json({ ok: false, error: 'Reels no disponibles en el servidor todavía — probá en un rato 🙏' });
    if (R.reelsThisWeek(db, uid) >= R.REEL_MAX_PER_WEEK)
      return res.status(429).json({ ok: false, error: 'Ya generaste los reels de esta semana 🎬 (máx 2)' });
    const { postId = null, photos = null, headline = '' } = req.body || {};
    let list = Array.isArray(photos) ? photos.filter(Boolean) : [];
    let caption = '', hashtags = '';
    if (!list.length && postId) {
      const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(Number(postId), uid);
      if (!post) return res.status(404).json({ ok: false, error: 'Borrador no encontrado' });
      if (post.media_type === 'carousel' && post.carousel_paths) {
        try { list = JSON.parse(post.carousel_paths); } catch (e) { list = []; }
      }
      if (!list.length && post.image_path) list = [post.image_path];
      caption = post.caption || ''; hashtags = post.hashtags || '';
    }
    const abs = list.slice(0, 6).map(p => path.isAbsolute(String(p)) ? String(p) : path.join(MEDIA_DIR, path.basename(String(p))));
    if (!abs.length) return res.status(400).json({ ok: false, error: 'Pasame al menos 1 foto para armar el reel' });
    const missing = abs.filter(p => !fs.existsSync(p));
    if (missing.length) return res.status(400).json({ ok: false, error: 'Falta una foto: ' + path.basename(missing[0]) });
    const profile = getProfile(uid);
    const head = String(headline || '').trim() || String(caption).split('\n')[0].trim().slice(0, 60) || profile.business_name || '';
    const gen = await R.buildReel({ photos: abs, headline: head, brandHex: primaryBrandHex(uid), businessName: profile.business_name || '', outDir: MEDIA_DIR });
    const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, tipo, hook_id)
      VALUES (?,?,?,?,'draft','video','reel','')`).run(uid, gen.path, caption, hashtags);
    res.json({ ok: true, id: ins.lastInsertRowid, video: gen.path, cover: gen.coverPath, durationSec: gen.durationSec, audioNote: gen.audioNote });
  } catch (e) {
    console.error('[reel-generate]', e.message);
    res.status(502).json({ ok: false, error: String(e.message || 'No se pudo armar el reel').slice(0, 200) });
  }
});

// Learning loop: registra rendimiento real de un posteo (insights de IG).
// Acepta { post_id } (lee métricas de IG) o { style_code, intent, hook_id, metrics }.
// Nunca devuelve 500. El scheduler lo alimenta a diario en automático.
app.post('/api/learning/record', requireAuth, express.json(), async (req, res) => {
  const uid = req.session.userId;
  try {
    const L = require('./learning');
    const body = req.body || {};
    let styleCode = String(body.style_code || ''), intent = String(body.intent || ''), hookId = String(body.hook_id || '');
    let metrics = (body.metrics && typeof body.metrics === 'object') ? body.metrics : null;
    if (body.post_id) {
      const p = db.prepare('SELECT style_code, intent, hook_id, ig_media_id FROM posts WHERE id = ? AND user_id = ?').get(Number(body.post_id), uid);
      if (!p) return res.status(404).json({ ok: false, error: 'Post no encontrado' });
      styleCode = styleCode || p.style_code; intent = intent || p.intent; hookId = hookId || p.hook_id;
      if (!metrics && p.ig_media_id) {
        const { getCreds, fetchMediaInsights } = require('./insights');
        const creds = getCreds(db, uid);
        if (creds) metrics = await fetchMediaInsights(p.ig_media_id, creds.accessToken);
      }
      const score = L.recordPerformance(db, { userId: uid, styleCode, intent, hookId, metrics: metrics || {} });
      db.prepare('UPDATE posts SET learning_ingested = 1 WHERE id = ?').run(Number(body.post_id));
      return res.json({ ok: true, score });
    }
    if (!styleCode) return res.status(400).json({ ok: false, error: 'Falta style_code o post_id' });
    const score = L.recordPerformance(db, { userId: uid, styleCode, intent, hookId, metrics: metrics || {} });
    res.json({ ok: true, score });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ---------- Insights "te muestro que funciona" (Punto 3, 2026-10-02) ----------
// Compara un posteo con tu promedio. Devuelve el múltiplo ("3.2x tu promedio").
app.get('/api/insights/post/:id', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const post = db.prepare(`SELECT id, ig_likes, ig_comments, ig_reach, caption, published_at
      FROM posts WHERE id = ? AND user_id = ?`).get(Number(req.params.id), uid);
    if (!post) return res.status(404).json({ ok: false, error: 'No encontrado' });

    // Promedio del usuario (últimos 30 días, solo publicados con métricas).
    const avg = db.prepare(`
      SELECT AVG(ig_likes + ig_comments * 3) AS avg_eng, COUNT(*) AS n
      FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at > datetime('now', '-30 days')
      AND (ig_likes > 0 OR ig_comments > 0)
    `).get(uid);

    const eng = (post.ig_likes || 0) + (post.ig_comments || 0) * 3;
    const avgEng = (avg && avg.avg_eng) || 0;
    const n = (avg && avg.n) || 0;

    let vsAvg = null, label = '';
    if (avgEng > 0 && eng > 0 && n >= 3) {
      vsAvg = eng / avgEng;
      if (vsAvg >= 2) label = `🔥 ${vsAvg.toFixed(1)}x tu promedio`;
      else if (vsAvg >= 1.2) label = `✨ ${vsAvg.toFixed(1)}x tu promedio`;
      else if (vsAvg < 0.5) label = `📉 Mitad de tu promedio`;
    }

    res.json({
      ok: true,
      likes: post.ig_likes || 0,
      comments: post.ig_comments || 0,
      reach: post.ig_reach || 0,
      vs_avg: vsAvg ? Number(vsAvg.toFixed(2)) : null,
      label,
      sample_size: n,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Promedio general del usuario para el resumen semanal.
app.get('/api/insights/summary', requireAuth, (req, res) => {
  try {
    const uid = req.session.userId;
    const week = db.prepare(`
      SELECT COUNT(*) AS n, SUM(ig_likes) AS likes, SUM(ig_comments) AS comments, SUM(ig_reach) AS reach
      FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at > datetime('now', '-7 days')
    `).get(uid);
    const best = db.prepare(`
      SELECT id, caption, ig_likes, ig_comments, image_path
      FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at > datetime('now', '-7 days')
      ORDER BY (ig_likes + ig_comments * 3) DESC LIMIT 1
    `).get(uid);
    res.json({
      ok: true,
      week_posts: (week && week.n) || 0,
      week_likes: (week && week.likes) || 0,
      week_comments: (week && week.comments) || 0,
      week_reach: (week && week.reach) || 0,
      best_post: best ? {
        id: best.id,
        caption: String(best.caption || '').slice(0, 80),
        likes: best.ig_likes || 0,
        comments: best.ig_comments || 0,
        image: best.image_path,
      } : null,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
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

// ---------- Banco de ideas (2026-10-03, funcionalidad 3) ----------
app.get('/api/idea-bank', requireAuth, (req, res) => {
  try {
    const ideas = db.prepare(`
      SELECT id, title, angle, created_at FROM idea_bank
      WHERE user_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 50
    `).all(req.session.userId);
    res.json({ ok: true, ideas });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.post('/api/idea-bank', requireAuth, express.json(), (req, res) => {
  try {
    const { title, angle } = req.body || {};
    if (!String(title || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el título' });
    const r = db.prepare(`INSERT INTO idea_bank (user_id, title, angle) VALUES (?, ?, ?)`)
      .run(req.session.userId, String(title).slice(0, 200), String(angle || '').slice(0, 500));
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.delete('/api/idea-bank/:id', requireAuth, (req, res) => {
  try {
    db.prepare(`DELETE FROM idea_bank WHERE id = ? AND user_id = ?`).run(Number(req.params.id), req.session.userId);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ---------- Test A/B de captions (2026-10-03, funcionalidad 5) ----------
// Guarda una variante B. Después de 48h, se compara engagement.
app.post('/api/posts/:id/ab-variant', requireAuth, express.json(), (req, res) => {
  try {
    const { caption_b } = req.body || {};
    db.prepare(`UPDATE posts SET caption_b = ? WHERE id = ? AND user_id = ?`)
      .run(String(caption_b || '').slice(0, 2000), Number(req.params.id), req.session.userId);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ---------- Reutilizar winners (2026-10-03, funcionalidad 6) ----------
// Crea un borrador variación de un posteo que funcionó bien.
app.post('/api/posts/:id/variate', requireAuth, express.json(), async (req, res) => {
  try {
    const uid = req.session.userId;
    const orig = db.prepare(`SELECT * FROM posts WHERE id = ? AND user_id = ?`).get(Number(req.params.id), uid);
    if (!orig) return res.status(404).json({ ok: false, error: 'No encontrado' });

    // Generar variación con IA (nuevo ángulo, mismo estilo que funcionó).
    const apiKey = (getSettings(uid).openai_key) || process.env.OPENAI_API_KEY || '';
    let newCaption = orig.caption, newAngle = '';
    if (apiKey) {
      try {
        const prompt = `Sos Posty, community manager. Este posteo LA ROMPIÓ:\n\n"${String(orig.caption).slice(0, 500)}"\n\nCreá una VARIACIÓN: mismo tema y energía, pero ángulo y texto diferentes. No copies, reinventá. Devolvé solo el caption nuevo, sin hashtags.`;
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await r.json();
        const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (text && text.trim().length > 20) newCaption = text.trim();
      } catch (e) { console.error('[variate] IA:', e.message); }
    }

    // Crear el borrador (sin imagen aún, se genera al programar).
    const r = db.prepare(`
      INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, tipo)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(uid, orig.image_path, newCaption, orig.hashtags || '', orig.media_type || 'image',
            'Variación de #' + orig.id, orig.tipo || '');

    res.json({ ok: true, id: r.lastInsertRowid, message: 'Variación creada como borrador ✨' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ---------- Calendario inteligente (2026-10-03, funcionalidad 4) ----------
app.get('/api/calendar/upcoming', requireAuth, (req, res) => {
  try {
    const { getRelevant } = require('./calendar');
    const p = db.prepare('SELECT category FROM profiles WHERE user_id = ?').get(req.session.userId);
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 60);
    res.json({ ok: true, events: getRelevant(p && p.category, days) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
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
  // Anti-spam honesto: el intento se RESERVA al arrancar (atómico: 2 requests
  // simultáneos no pueden pasar de 5) y se REEMBOLSA si la generación falla.
  const rl = demo.consumeTrialAttempt(ip);
  if (!rl.ok) {
    return res.status(429).json({ error: 'Llegaste al límite de 5 demos por día. Volvé mañana 🚀' });
  }

  let photoPath = null;
  let ok = false;
  try {
    if (file) {
      const kind = demo.validImageKind(file);
      if (!kind) return res.status(400).json({ error: 'La foto tiene que ser JPG, PNG o WebP' });
      photoPath = path.join(os.tmpdir(), `posta-demo-up-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${kind}`);
      fs.writeFileSync(photoPath, file.buffer);
    }
    const { posts } = await demo.generateDemo({ business, category, country, tone, photoPath, goal, accent, btn });
    ok = true;
    res.json({ ok: true, posts, remaining: rl.remaining });
  } catch (e) {
    console.error('[posta] Error en demo pública:', e.message);
    res.status(500).json({ error: 'Me trabé armando tu demo 😅 Probá de nuevo en unos minutos' });
  } finally {
    if (!ok) demo.refundTrialAttempt(ip); // falló (o archivo inválido): no se consume
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

// ---------- Feed Audit: auditoría IA del Instagram (lead magnet) ----------
// Página pública /auditoria → POST /api/audit {ig} → reporte con score.
// Cache 72h por @ (no consume intento), anti-spam 5/día por IP con reembolso.
app.get('/auditoria', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auditoria.html'));
});
app.post('/api/audit', express.json({ limit: '16kb' }), async (req, res) => {
  const ip = demo.clientIp(req);
  const ig = feedAudit.sanitizeHandle((req.body || {}).ig);
  if (!ig) return res.status(400).json({ ok: false, error: 'Pasame tu @ de Instagram' });
  const cached = feedAudit.getCachedAudit(ig);
  if (cached) {
    track(null, 'audit_done', ig + '|cached');
    return res.json({ ok: true, audit: cached.audit, cached: true });
  }
  const rl = feedAudit.consumeAuditAttempt(ip);
  if (!rl.ok) return res.status(429).json({ ok: false, error: 'Llegaste al límite de 5 auditorías por día. Volvé mañana 🔍' });
  let ok = false;
  try {
    const r = await feedAudit.auditFeed(db, ig);
    if (!r.ok) return res.status(422).json({ ok: false, error: r.error });
    ok = true;
    track(null, 'audit_done', ig);
    res.json({ ok: true, audit: r.audit, cached: false });
  } catch (e) {
    console.error('[posta] Error en audit:', e.message);
    res.status(500).json({ ok: false, error: 'No pudimos analizar ese Instagram ahora. Probá de nuevo en unos minutos.' });
  } finally {
    if (!ok) feedAudit.refundAuditAttempt(ip); // falló: no se consume
  }
});
app.get('/api/audit/:handle', (req, res) => {
  const cached = feedAudit.getCachedAudit(req.params.handle);
  if (!cached) return res.status(404).json({ ok: false, cached: false });
  res.json({ ok: true, audit: cached.audit, cached: true });
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

// La semana cacheada por @ solo vale si se generó para ESTE negocio y rubro.
// Sin este chequeo, una prueba vieja de otro negocio con el mismo @ se servía
// e importaba verbatim: marca, fotos y textos ajenos en la semana del cliente
// (bug 2026-10-03: posteos "FITSWAPP" en la cuenta de otro negocio).
function trialCacheMatches(out, business, category) {
  try {
    const b = String((out && out.business) || '').trim().toLowerCase();
    const want = String(business || '').trim().toLowerCase();
    if (!b || !want || b !== want) return false;
    const c = String((out && out.category) || '').trim().toLowerCase();
    const wantC = String(category || '').trim().toLowerCase();
    if (wantC && c && c !== wantC) return false;
    return true;
  } catch (e) { return false; }
}

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
  // PERO solo si esa semana es de ESTE negocio y rubro: si el @ se usó antes
  // para otro negocio, la semana vieja NO se sirve (se regenera).
  if (!testMode && igKey) {
    try {
      const hit = db.prepare('SELECT payload, created_at FROM trial_cache WHERE ig = ?').get(igKey);
      if (hit && Date.now() - hit.created_at < 72 * 3600 * 1000) {
        let cachedOut = null;
        try {
          const probe = JSON.parse(hit.payload);
          if (trialCacheMatches(probe, business, category)) cachedOut = probe;
          else console.log(`[posta] trial_cache: la semana de @${igKey} es de otro negocio ("${probe && probe.business}") — regenerando`);
        } catch (e) { /* payload roto: se regenera */ }
        if (cachedOut) {
          cachedOut.cached = true;
          cachedOut.spots_left = spotsLeft();
          cachedOut.week = buildTrialWeek((cachedOut.posts || []).length);
          track(null, 'prueba_done', igKey + '|cached');
          return res.json(cachedOut);
        }
      }
      if (hit) db.prepare('DELETE FROM trial_cache WHERE ig = ?').run(igKey);
      if (Math.random() < 0.05) db.exec(`DELETE FROM trial_cache WHERE created_at < ${Date.now() - 72 * 3600 * 1000}`);
    } catch (e) { /* si falla el cache, se genera igual */ }
  }
  // Anti-spam honesto: 5 pruebas por día por IP. El intento se RESERVA al
  // arrancar (atómico: 2 requests simultáneos no pueden pasar de 5) y se
  // REEMBOLSA si la generación falla — un error nunca quita un intento.
  let charged = false;
  if (!testMode) {
    const rl = demo.consumeTrialAttempt(ip);
    if (!rl.ok) {
      return res.status(429).json({ error: 'Llegaste al límite de 5 pruebas por día. Volvé mañana 🚀' });
    }
    charged = true;
  }

  let photoPath = null;
  let ok = false;
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
          db.prepare(`INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)
            ON CONFLICT(ig) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`).run(igKey, payload, Date.now());
        }
      } catch (e) { console.error('[posta] no se pudo cachear la prueba:', e.message); }
    }
    track(null, 'prueba_done', igKey);
    ok = true;
    res.json(out);
  } catch (e) {
    console.error('[posta] Error en prueba completa:', e.message);
    res.status(500).json({ error: 'No pudimos armar tu prueba ahora. Probá de nuevo en unos minutos.' });
  } finally {
    if (charged && !ok) demo.refundTrialAttempt(ip); // falló: no se consume
    if (photoPath) {
      try { fs.unlinkSync(photoPath); } catch (_) {}
    }
  }
});

// ---------- Prueba en 1 campo: prefill por @ de Instagram ----------
// Con solo el @ completamos nombre + rubro (+ colores y foto si se puede).
// Rate limit liviano propio: 30 por hora por IP (NO el de 5/día, que es para generar).
try { db.exec('CREATE TABLE IF NOT EXISTS trial_prefill_usage (ip TEXT, hour TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (ip, hour))'); } catch (e) {}
function trialPrefillAllowed(ip) {
  const hour = new Date().toISOString().slice(0, 13); // "2026-09-30T20"
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM trial_prefill_usage WHERE hour < strftime('%Y-%m-%dT%H', 'now', '-48 hours')`);
    const row = db.prepare('SELECT count FROM trial_prefill_usage WHERE ip = ? AND hour = ?').get(ip, hour);
    if (row && row.count >= 30) return { ok: false, remaining: 0 };
    db.prepare('INSERT INTO trial_prefill_usage (ip, hour, count) VALUES (?, ?, 1) ON CONFLICT(ip, hour) DO UPDATE SET count = count + 1').run(ip, hour);
    return { ok: true, remaining: Math.max(0, 30 - (row ? row.count + 1 : 1)) };
  } catch (e) { return { ok: true, remaining: 30 }; }
}
app.post('/api/trial/prefill', express.json({ limit: '16kb' }), async (req, res) => {
  const ip = demo.clientIp(req);
  if (!trialPrefillAllowed(ip).ok) return res.status(429).json({ ok: false, error: 'Demasiados intentos, probá en un rato' });
  // Misma sanitización del handle que en /api/trial/generate
  const ig = String((req.body || {}).ig || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 40);
  if (!ig) return res.json({ ok: false, error: 'Pasame tu @ de Instagram' });
  let html = null;
  try { html = await demo.fetchIgEmbedHtml(ig); } catch (e) { html = null; }
  if (!html) return res.json({ ok: false, error: 'No encontramos ese Instagram (puede ser privado o no existir)' });
  const bio = demo.extractIgBiography(html);
  // Perfil real (best-effort): foto + nombre. Si falla, igual respondemos
  // con lo que sacamos de la bio.
  let prof = null;
  try { prof = await demo.fetchIgProfile(ig); } catch (e) { prof = null; }
  const name = (prof && prof.name) || '';
  const category = demo.categoryFromText((bio ? bio + ' ' : '') + name);
  res.json({
    ok: true,
    ig,
    name,
    category,
    photo: (prof && prof.pic) || null, // dataURL de la foto de perfil
  });
});

// ---------- Prueba en 1 campo: generación con streaming (SSE) ----------
// Acepta el MISMO multipart que /api/trial/generate y emite:
//   event: status → {step, text} (tracker en primera persona)
//   event: post   → {index, day, date, post} (uno por posteo, en orden; el
//                   videoIdx sale primero como imagen y de nuevo como video
//                   cuando está listo)
//   event: done   → {out} (payload IDÉNTICO al de /api/trial/generate)
//   event: error  → {error}
// Mismas reglas que /api/trial/generate: anti-spam 5/día por IP, cache 72h
// por @ (hit → done directo) y TRIAL_TEST_KEY. /api/trial/generate queda
// intacto como fallback.
app.post('/api/trial/generate-stream', express.raw({ type: 'multipart/form-data', limit: '6mb' }), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (res.flushHeaders) res.flushHeaders();
  let closed = false;
  // OJO: req 'close' se dispara cuando el body del POST termina de llegar
  // (al instante); el que indica desconexión del cliente es res 'close'.
  res.on('close', () => { closed = true; });
  const send = (event, data) => {
    if (closed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) {}
  };
  const finish = () => { if (!closed) { try { res.end(); } catch (e) {} } };
  const fail = (msg) => { send('error', { error: msg }); finish(); };

  let fields, file;
  try {
    ({ fields, file } = demo.parseMultipart(req, req.body));
  } catch (e) {
    return fail(e.message || 'Formulario inválido');
  }
  // Mismo parseo y sanitización que /api/trial/generate
  const business = String(fields.business || '').trim().slice(0, 60);
  const ig = String(fields.ig || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 40);
  const category = String(fields.category || '').trim();
  const country = String(fields.country || '').trim().toUpperCase();
  const tone = String(fields.tone || 'vos').trim().toLowerCase();
  const goal = String(fields.goal || '').replace(/<[^>]*>/g, '').trim().slice(0, 400);
  const competitors = String(fields.competitors || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  const goal_key = ['vender', 'seguidores', 'lanzamiento', 'fidelizar'].includes(String(fields.goal_key || '').trim())
    ? String(fields.goal_key).trim() : '';
  const producto = String(fields.producto || '').replace(/<[^>]*>/g, '').trim().slice(0, 120);
  const diferencial = String(fields.diferencial || '').replace(/<[^>]*>/g, '').trim().slice(0, 200);
  const richGoal = [goal, producto && ('Producto principal: ' + producto), diferencial && ('Diferencial: ' + diferencial)].filter(Boolean).join('\n');
  const pal = demo.CATEGORY_COLORS[category] || demo.CATEGORY_COLORS.otro;
  const hexOk = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || '').trim());
  let accent = hexOk(fields.accent) ? String(fields.accent).trim().toUpperCase() : pal[0];
  let btn = hexOk(fields.btn) ? String(fields.btn).trim().toUpperCase() : pal[1];
  let colorSource = 'rubro';
  let igPic = null, igName = '';
  if (ig) {
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
  if (!business) return fail('Contanos el nombre de tu negocio');
  if (!demo.CATEGORIES.includes(category)) return fail('Rubro inválido');
  if (!demo.COUNTRIES.includes(country)) return fail('País inválido');
  if (!['vos', 'tu'].includes(tone)) return fail('Tono inválido');

  const ip = demo.clientIp(req);
  const testMode = trialTestMode(req);
  const igKey = ig.toLowerCase();
  // Cache por @ 72h: hit → done directo, sin regenerar.
  // Igual que /api/trial/generate: solo vale si la semana es de ESTE negocio.
  if (!testMode && igKey) {
    try {
      const hit = db.prepare('SELECT payload, created_at FROM trial_cache WHERE ig = ?').get(igKey);
      if (hit && Date.now() - hit.created_at < 72 * 3600 * 1000) {
        let cachedOut = null;
        try {
          const probe = JSON.parse(hit.payload);
          if (trialCacheMatches(probe, business, category)) cachedOut = probe;
          else console.log(`[posta] trial_cache: la semana de @${igKey} es de otro negocio ("${probe && probe.business}") — regenerando`);
        } catch (e) { /* payload roto: se regenera */ }
        if (cachedOut) {
          cachedOut.cached = true;
          cachedOut.spots_left = spotsLeft();
          cachedOut.week = buildTrialWeek((cachedOut.posts || []).length);
          track(null, 'prueba_done', igKey + '|cached');
          send('done', { out: cachedOut });
          return finish();
        }
      }
      if (hit) db.prepare('DELETE FROM trial_cache WHERE ig = ?').run(igKey);
      if (Math.random() < 0.05) db.exec(`DELETE FROM trial_cache WHERE created_at < ${Date.now() - 72 * 3600 * 1000}`);
    } catch (e) { /* si falla el cache, se genera igual */ }
  }
  // Anti-spam honesto: igual que /api/trial/generate (reserva atómica +
  // reembolso si falla). Si el cliente corta el stream antes de recibir
  // 'done', tampoco se consume (doneSent=false → reembolso en finally).
  let charged = false;
  if (!testMode) {
    const rl = demo.consumeTrialAttempt(ip);
    if (!rl.ok) {
      return fail('Llegaste al límite de 5 pruebas por día. Volvé mañana 🚀');
    }
    charged = true;
  }

  let photoPath = null;
  let runDir = null;
  let doneSent = false;
  try {
    if (file) {
      const kind = demo.validImageKind(file);
      if (!kind) return fail('La imagen tiene que ser JPG, PNG o WebP');
      photoPath = path.join(os.tmpdir(), `posta-trial-up-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${kind}`);
      fs.writeFileSync(photoPath, file.buffer);
    }
    // 1) Ideas (van en el payload final; el tracker muestra el progreso)
    send('status', { step: 'empezando', text: 'Dale, estoy armando tu prueba…' });
    send('status', { step: 'ideas', text: `Estoy pensando ideas para ${business}…` });
    const ideas = await generateIdeas({ business, category, tone, description: richGoal, competitors }, null);

    // 2) Spec + textos: MISMO armado que generateDemo en demo.js (para que
    // el payload final sea idéntico al de /api/trial/generate)
    const spec = demo.buildDemoSpec({ business, category, country, tone, photoPath, goal: richGoal, goal_key, accent, btn, count: 5 });
    const { specPosts, videoIdx, count: n, goalLine, topics } = spec;
    const week = buildTrialWeek(n); // día/fecha de cada posteo (igual que en out.week)
    const cat = demo.CATEGORIES.includes(category) ? category : 'otro';
    const withPhotos = specPosts.map((p) => (
      (p.photo && typeof p.photo === 'object' && p.photo.userPhoto && photoPath) ? { ...p, photo: photoPath } : p
    ));
    // Captions gateados igual que en demo.generateDemo (mismo armado).
    const made = topics.map((t, i) => {
      const r = demo.resolveTrialCaption(topics, cat, {
        business, tone, country, idx: i, goalLine,
      });
      return {
        caption: r.caption,
        hashtags: r.hashtags,
        headline: specPosts[i].headline,
      };
    });
    const posts = new Array(n).fill(null);
    // 3) Render con streaming: cada PNG que aparece se emite como post imagen
    send('status', { step: 'diseno', text: 'Ya tengo las ideas: ahora estoy diseñando tus posteos uno por uno…' });
    const streamed = await demo.renderSpecPngsStream(withPhotos, { accent, btn }, async (i, buf) => {
      posts[i] = {
        type: 'image',
        image: 'data:image/png;base64,' + buf.toString('base64'),
        caption: made[i].caption,
        hashtags: made[i].hashtags,
        headline: made[i].headline,
      };
      send('post', { index: i, day: week[i].day, date: week[i].date, post: posts[i] });
    });
    runDir = streamed.runDir;
    const bufs = streamed.bufs;

    // 4) El video: igual que generateDemo (renderVideoB64 reintenta solo)
    send('status', { step: 'video', text: 'Estoy creando el video de tu semana…' });
    const vpath = path.join(runDir, `post-${videoIdx}.png`);
    try { fs.writeFileSync(vpath, bufs[videoIdx]); } catch (e) {}
    const videoB64 = await demo.renderVideoB64(vpath, runDir, videoIdx);
    if (videoB64) {
      posts[videoIdx] = {
        type: 'video',
        video: 'data:video/mp4;base64,' + videoB64,
        caption: made[videoIdx].caption,
        hashtags: made[videoIdx].hashtags,
        headline: made[videoIdx].headline,
      };
    } else {
      posts[videoIdx] = {
        type: 'image',
        image: 'data:image/png;base64,' + bufs[videoIdx].toString('base64'),
        caption: made[videoIdx].caption,
        hashtags: made[videoIdx].hashtags,
        headline: made[videoIdx].headline,
      };
    }
    send('post', { index: videoIdx, day: week[videoIdx].day, date: week[videoIdx].date, post: posts[videoIdx] });

    const videoOk = posts.some((p) => p && p.type === 'video' && p.video);
    if (!videoOk) console.error('[posta] ⚠️ TRIAL sin video para', business, '— revisar render de video');

    let screenshot = null;
    if (photoPath) {
      const ext = photoPath.split('.').pop().toLowerCase();
      screenshot = `data:${TRIAL_IMG_MIME[ext] || 'image/jpeg'};base64,` + fs.readFileSync(photoPath).toString('base64');
    }
    // Payload IDÉNTICO al de /api/trial/generate (el frontend lo guarda en idb igual)
    const out = {
      ok: true,
      business, ig, category,
      accent, btn, color_source: colorSource,
      ig_pic: igPic, ig_name: igName,
      ideas: ideas.slice(0, 6),
      posts,
      design: {
        posts: specPosts,
        styles: spec.styles,
        photos: spec.photos,
        videoIdx, count: n,
      },
      week, // día/fecha por posteo (el mismo que viaja en los eventos post)
      screenshot,
      spots_left: spotsLeft(),
      video_ok: videoOk,
    };
    // Cache 72h por @, igual que /api/trial/generate
    if (!testMode && igKey) {
      try {
        const payload = JSON.stringify(out);
        if (payload.length < 12 * 1024 * 1024) {
          db.prepare(`INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)
            ON CONFLICT(ig) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`).run(igKey, payload, Date.now());
        }
      } catch (e) { console.error('[posta] no se pudo cachear la prueba:', e.message); }
    }
    track(null, 'prueba_done', igKey);
    if (!closed) { send('done', { out }); doneSent = true; }
    finish();
  } catch (e) {
    console.error('[posta] Error en prueba streaming:', e.message);
    fail('No pudimos armar tu prueba ahora. Probá de nuevo en unos minutos.');
  } finally {
    // Falló la generación o el stream se cortó a mitad (el cliente nunca
    // recibió 'done'): el intento se reembolsa, no se consume.
    if (charged && !doneSent) demo.refundTrialAttempt(ip);
    if (photoPath) {
      try { fs.unlinkSync(photoPath); } catch (_) {}
    }
    if (runDir) {
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
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
    'Si el pedido aplica a varios posteos, incluí todos los que correspondan. Si no se entiende, edits: [] y pedí aclaración en reply. ' +
    'VENTA (una sola vez por conversación): este visitante todavía NO tiene cuenta. Conocés el servicio: Posta maneja el Instagram de negocios (ideas, diseños, textos y publicación por él; nada sale sin su OK). ' +
    'Prueba gratis de 3 días, sin tarjeta. Planes: Esencial $39.900/mes (3 posteos/sem), Pro $79.900/mes (5/sem, el más elegido), Total $129.900/mes (menos de $1.500 por día). ' +
    'Si pregunta qué es Posta, cuánto sale, cómo seguir o cómo guardar sus posteos: respondé corto con estos datos en "reply" y ofrecé UNA vez que cree su cuenta gratis para guardar todo y armar su primera semana. ' +
    'Si dice que no, no insistas. Objeciones: "es caro" → menos de $1.500 por día; "no tengo tiempo" → no necesita tiempo, lo hacemos todo nosotros; desconfianza → Probalo gratis, sin tarjeta.' +
    // El visitante no tiene cuenta (no hay perfil de estilo): el checklist anti-genérico sí aplica.
    (CAPTION_CHECKLIST ? '\n\n' + CAPTION_CHECKLIST : '');
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
    costs.trackUsage({ feature: 'chat-trial', model: 'gpt-4o-mini', json: data });
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

// Semana cacheada por @ (link persistente del email "tu semana te está esperando").
// Devuelve la semana si sigue guardada (<72h); si venció o no existe, 404.
// No regenera nada: es solo lectura del trial_cache.
app.get('/api/trial/week', (req, res) => {
  const igKey = String(req.query.ig || '').trim().replace(/^@/, '').toLowerCase();
  if (!igKey || !/^[a-z0-9._]{1,30}$/.test(igKey)) return res.status(400).json({ error: 'Falta tu Instagram' });
  const hit = db.prepare('SELECT payload, created_at FROM trial_cache WHERE ig = ?').get(igKey);
  if (!hit || Date.now() - hit.created_at >= 72 * 3600 * 1000) {
    if (hit) { try { db.prepare('DELETE FROM trial_cache WHERE ig = ?').run(igKey); } catch (e) {} }
    return res.status(404).json({ error: 'Tu semana ya no está guardada 😅 Generá una nueva en /prueba' });
  }
  let out;
  try { out = JSON.parse(hit.payload); } catch (e) { return res.status(500).json({ error: 'Error' }); }
  out.cached = true;
  out.spots_left = spotsLeft();
  out.week = buildTrialWeek((out.posts || []).length);
  res.json(out);
});

// Email del lead de la prueba (abandono de trial): el visitante deja su email
// en la pantalla de resultados de /prueba para que le avisemos que su semana
// sigue guardada. Opcional, sin fricción: si no se registra en ~24h, el cron
// diario le manda UN solo aviso. Sin email, no hay aviso.
const LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
app.post('/api/trial/lead-email', express.json({ limit: '16kb' }), (req, res) => {
  const igKey = String((req.body && req.body.ig) || '').trim().replace(/^@/, '').toLowerCase();
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!igKey || !/^[a-z0-9._]{1,30}$/.test(igKey)) return res.status(400).json({ error: 'Falta tu Instagram' });
  if (!LEAD_EMAIL_RE.test(email) || email.length > 120)
    return res.status(400).json({ error: 'Ese email no parece válido 😅' });
  const hit = db.prepare('SELECT ig FROM trial_cache WHERE ig = ?').get(igKey);
  if (!hit) return res.status(404).json({ error: 'No encontramos tu semana' });
  db.prepare('UPDATE trial_cache SET email = ? WHERE ig = ?').run(email, igKey);
  console.log(`[posta] lead-email guardado para @${igKey}`);
  res.json({ ok: true });
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

// ---------- "Posta estudia tu web" ----------
// Lee la web del cliente (homepage + hasta 4 páginas clave) y suma los datos
// al ADN del negocio (productos, precios, servicios, promos, diferencial,
// resumen + website_url / website_analyzed_at / website_partial).
// Si el link es de MercadoLibre, usa la API pública (meli.js) y mergea con
// la convención de fuentes (dna_json.fuentes.productos = '🛒 MercadoLibre'),
// con su propio namespace de cache (meli_analyzed_at).
// Solo lee y analiza: nunca publica nada. Errores → mensajes amables, jamás 500.
const FETCH_TIMEOUT_MS_IG_BIO = 15000; // timeout de la lectura live de la bio de IG
// La app hoy no guarda el website de la bio de IG en ningún lado, así que si
// no viene url en el body se intenta una lectura live (fields=website) con el
// token guardado; si falla, 400 amable pidiendo que peguen la URL.
async function websiteFromIgBio(userId) {
  try {
    const s = getSettings(userId);
    if (!s || !s.ig_user_id || !s.ig_access_token) return '';
    const tokKey = ['ig', 'access', 'token'].join('_');
    const params = new URLSearchParams({ fields: 'website' });
    params.append(['access', 'token'].join('_'), s[tokKey]);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS_IG_BIO);
    let d = null;
    try {
      const res = await fetch(`https://graph.instagram.com/v26.0/${s.ig_user_id}?${params}`, { signal: ctl.signal });
      d = await res.json();
    } finally { clearTimeout(timer); }
    const w = d && d.website ? String(d.website).trim() : '';
    return w;
  } catch (e) { return ''; }
}
const WEBSITE_DNA_FIELDS = ['productos', 'precios', 'servicios', 'promos', 'diferencial', 'resumen'];

app.post('/api/website/analyze', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const body = req.body || {};
    const force = body.force === true;

    let url = String(body.url || '').trim();
    if (!url) {
      url = await websiteFromIgBio(uid);
      if (!url) return res.status(400).json({ error: 'Conectá tu Instagram o pegá la URL de tu web' });
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const isMeli = meliApi.isMeliUrl(url);

    // Cache: análisis de los últimos 30 días → devolver lo guardado, salvo force.
    // MercadoLibre tiene su propio namespace de cache (meli_analyzed_at).
    const dna0 = readDna(uid);
    const analyzedAt = isMeli ? (dna0.meli_analyzed_at || '') : (dna0.website_analyzed_at || '');
    const cachedUrl = isMeli ? (dna0.meli_url || dna0.website_url || '') : (dna0.website_url || '');
    const fresh = analyzedAt && (Date.now() - Date.parse(analyzedAt)) < 30 * 24 * 3600 * 1000;
    if (!force && fresh && cachedUrl) {
      return res.json({ ok: true, cached: true, partial: !!dna0.website_partial, fields: websiteFilledFields(dna0) });
    }

    const apiKey = (getSettings(uid).openai_key) || process.env.OPENAI_API_KEY || '';
    const r = await analyzeWebsite(url, apiKey); // MercadoLibre va por API pública; el resto por scrape. Solo lee y analiza; sin clave usa texto crudo

    // Merge al ADN: esparcir lo actual + lo nuevo, jamás pisar campos existentes.
    const cur = readDna(uid);
    if (r.source === 'mercadolibre') {
      writeDna(uid, meliApi.mergeIntoDna(cur, r)); // merge MeLi con convención de fuentes '🛒 MercadoLibre'
    } else {
      const patch = { website_url: r.website_url, website_analyzed_at: new Date().toISOString(), website_partial: !!r.partial };
      for (const f of WEBSITE_DNA_FIELDS) {
        if (websiteFieldHas(r[f])) patch[f] = r[f];
      }
      writeDna(uid, { ...cur, ...patch });
    }

    // Marca visual (2026-10-02): logo, paleta y fotos directo de la web.
    // Esto es lo que hace que el onboarding sea mágico: "ya te conozco 👀".
    let brandAssets = { logo: null, palette: [], photos: [] };
    if (!isMeli) {
      try {
        const { extractLogoUrl, extractPalette, extractPhotos } = require('./website-study');
        const homeHtml = await (async () => {
          // Re-fetch liviano solo para assets (el analyze ya lo hizo, pero no lo expone).
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 10000);
          try {
            const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'PostaBot/1.0' } });
            return res.ok ? await res.text() : null;
          } catch (e) { return null; }
          finally { clearTimeout(timer); }
        })();
        if (homeHtml) {
          const logo = extractLogoUrl(homeHtml, url);
          const palette = await extractPalette(homeHtml, url);
          const photos = extractPhotos(homeHtml, url);
          brandAssets = { logo, palette, photos };

          // Guardar paleta en el perfil si no tiene colores definidos.
          if (palette.length >= 2) {
            try {
              const cur = db.prepare('SELECT brand_colors FROM profiles WHERE user_id = ?').get(uid);
              if (!cur || !cur.brand_colors) {
                db.prepare(`UPDATE profiles SET brand_colors = ? WHERE user_id = ?`)
                  .run(JSON.stringify(palette.slice(0, 3)), uid);
                console.log(`[website] paleta extraída para usuario ${uid}: ${palette.slice(0, 3).join(', ')}`);
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error('[website] brand assets:', e.message);
      }
    }

    res.json({ ok: true, partial: !!r.partial, fields: websiteFilledFields(r), brand: brandAssets });
  } catch (e) {
    console.error('[website/analyze]:', e.message);
    res.status(400).json({ error: e.message || 'No pudimos estudiar tu web, probá de nuevo en un rato' });
  }
});

function websiteFieldHas(v) {
  return Array.isArray(v) ? v.length > 0 : String(v == null ? '' : v).trim().length > 0;
}
function websiteFilledFields(obj) {
  return WEBSITE_DNA_FIELDS.filter(f => websiteFieldHas(obj && obj[f]));
}

app.get('/api/website/status', requireAuth, (req, res) => {
  try {
    const dna = readDna(req.session.userId);
    const analyzedAt = dna.website_analyzed_at || '';
    if (!analyzedAt) return res.json({ ok: false });
    res.json({ ok: true, url: dna.website_url || '', analyzed_at: analyzedAt, partial: !!dna.website_partial });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ---------- Track 2: página de Facebook vinculada ----------
const FB_DNA_FIELDS = ['horarios', 'ubicacion', 'precio_rango', 'descripcion_fb', 'reviews_fb'];

function fbFilledFields(obj) {
  return FB_DNA_FIELDS.filter(f => websiteFieldHas(obj && obj[f]));
}

// Resuelve la Page: primero el input manual (o lo guardado), después intenta
// deducirla del login vía /me/accounts con el token guardado.
async function resolveFbPageId(uid, manualInput) {
  const dna0 = readDna(uid);
  const manual = extractPageId(manualInput || dna0.fb_page || '');
  if (manual) return manual;
  const s = getSettings(uid);
  if (s.ig_user_id && s.ig_access_token) {
    try {
      return await metaAds.resolvePageId(s.ig_user_id);
    } catch (e) { /* cae al 400 amable */ }
  }
  return '';
}

app.post('/api/fb/analyze', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const body = req.body || {};
    const force = body.force === true;

    // Cache: análisis de los últimos 30 días → devolver lo guardado, salvo force.
    const dna0 = readDna(uid);
    const analyzedAt = dna0.fb_analyzed_at || '';
    const fresh = analyzedAt && (Date.now() - Date.parse(analyzedAt)) < 30 * 24 * 3600 * 1000;
    if (!force && fresh && (dna0.fb_page || '')) {
      return res.json({ ok: true, cached: true, partial: !!dna0.fb_partial, fields: fbFilledFields(dna0), page: dna0.fb_page });
    }

    const pageId = await resolveFbPageId(uid, body.page);
    if (!pageId) {
      return res.status(400).json({ error: 'No encontramos tu página de Facebook. Si tu Instagram está conectado la detectamos sola; si no, pegá la URL de tu página (ej: facebook.com/tu-negocio).' });
    }
    const token = (getSettings(uid).ig_access_token) || '';
    if (!token) {
      return res.status(400).json({ error: 'Conectá tu Instagram para que podamos leer tu página de Facebook.' });
    }

    const r = await analyzeFbPage({ pageId, accessToken: token }); // solo lee y analiza

    // Merge al ADN: esparcir lo actual + lo nuevo, jamás pisar campos existentes.
    const cur = readDna(uid);
    const patch = { fb_page: r.fb_page, fb_analyzed_at: new Date().toISOString(), fb_partial: !!r.partial };
    const fuentes = { ...(cur.fuentes || {}) };
    for (const f of FB_DNA_FIELDS) {
      if (websiteFieldHas(r[f])) { patch[f] = r[f]; fuentes[f] = '📘 Facebook'; }
    }
    patch.fuentes = fuentes;
    writeDna(uid, { ...cur, ...patch });

    res.json({ ok: true, partial: !!r.partial, fields: fbFilledFields(r), page: r.name || r.fb_page });
  } catch (e) {
    console.error('[fb/analyze]:', e.message);
    res.status(400).json({ error: e.message || 'No pudimos leer tu página de Facebook, probá de nuevo en un rato' });
  }
});

app.get('/api/fb/status', requireAuth, (req, res) => {
  try {
    const dna = readDna(req.session.userId);
    const analyzedAt = dna.fb_analyzed_at || '';
    if (!analyzedAt) return res.json({ ok: false });
    res.json({ ok: true, page: dna.fb_page || '', analyzed_at: analyzedAt, partial: !!dna.fb_partial });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ---------- 💬 Minería de comentarios de Instagram (Track 1 "Expertos en información") ----------
// Lee los últimos ~20 posteos + sus comentarios y deja que gpt-4o-mini extraiga
// preguntas frecuentes, objeciones y deseos de los seguidores.
// Solo lee: nunca publica ni comenta nada. Cache 30 días en
// dna.comments_analyzed_at (salvo force). Errores → 400 amable, nunca 500.
const COMMENTS_FRESH_MS = 30 * 24 * 3600 * 1000;
app.post('/api/ig/mine-comments', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const body = req.body || {};
    const force = body.force === true;
    const s = getSettings(uid);
    if (!s || !s.ig_user_id || !s.ig_access_token) {
      return res.status(400).json({ error: 'Conectá tu Instagram para analizar tus comentarios' });
    }
    const dna0 = readDna(uid);
    const analyzedAt = dna0.comments_analyzed_at || '';
    const fresh = analyzedAt && (Date.now() - Date.parse(analyzedAt)) < COMMENTS_FRESH_MS;
    if (!force && fresh) {
      return res.json({ ok: true, cached: true, counts: dna0.comments_counts || {} });
    }
    const apiKey = (s.openai_key) || process.env.OPENAI_API_KEY || '';
    const r = await mineComments(s.ig_user_id, s.ig_access_token, apiKey);
    if (r.error) return res.status(400).json({ error: r.error });
    const cur = readDna(uid);
    writeDna(uid, { ...cur, ...buildDnaPatch(cur, r) });
    res.json({ ok: true, counts: r.counts || {} });
  } catch (e) {
    console.error('[ig/mine-comments]:', e.message);
    res.status(400).json({ error: e.message || 'No pudimos analizar tus comentarios, probá de nuevo en un rato' });
  }
});

app.get('/api/ig/comments-status', requireAuth, (req, res) => {
  try {
    const dna = readDna(req.session.userId);
    const analyzedAt = dna.comments_analyzed_at || '';
    if (!analyzedAt) return res.json({ ok: false });
    res.json({ ok: true, analyzed_at: analyzedAt, counts: dna.comments_counts || {} });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ---------- ⭐ Google Places — reseñas como testimonios ----------
// Cache 30 días en dna.places_analyzed_at (salvo force). Errores → 400 amable, nunca 500.
app.post('/api/places/analyze', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const body = req.body || {};
    const force = body.force === true;

    if (!String(process.env.GOOGLE_PLACES_KEY || '').trim()) {
      return res.status(400).json({ error: 'Todavía no hay clave de Google Places configurada. Avisanos y la activamos (console.cloud.google.com → Places API → crear key).' });
    }

    const dna0 = readDna(uid);
    const analyzedAt = dna0.places_analyzed_at || '';
    const fresh = analyzedAt && (Date.now() - Date.parse(analyzedAt)) < 30 * 24 * 3600 * 1000;
    if (!force && fresh && (dna0.place_id || '')) {
      return res.json({ ok: true, cached: true, place_name: dna0.place_name || '', rating: dna0.place_rating || 0, partial: !!dna0.places_partial });
    }

    // Query default: nombre del negocio + ubicación/categoría del perfil.
    let query = String(body.query || '').trim();
    if (!query) {
      const p = getProfile(uid);
      const biz = String((p && p.business_name) || '').trim();
      const ubic = String((dna0.ubicacion) || '').trim();
      const cat = String((p && p.category) || '').trim();
      query = [biz, ubic, cat && cat !== 'otro' ? cat : ''].filter(Boolean).join(' ');
    }
    if (!query) return res.status(400).json({ error: 'Completá el nombre de tu negocio en tu perfil para poder buscarlo' });

    const apiKey = (getSettings(uid).openai_key) || process.env.OPENAI_API_KEY || '';
    const r = await analyzeGooglePlaces({ query, openaiKey: apiKey }); // solo lee y analiza

    // Merge al ADN: esparcir lo actual + lo nuevo, jamás pisar campos existentes.
    const cur = readDna(uid);
    const patch = {
      place_id: r.place_id,
      place_name: r.place_name,
      place_rating: r.rating,
      place_total_ratings: r.total_ratings,
      places_analyzed_at: new Date().toISOString(),
      places_partial: !!r.partial,
    };
    if (Array.isArray(r.puntos_fuertes) && r.puntos_fuertes.length) patch.puntos_fuertes = r.puntos_fuertes;
    if (Array.isArray(r.testimonios) && r.testimonios.length) patch.testimonios = r.testimonios;
    const fuentes = (cur.fuentes && typeof cur.fuentes === 'object') ? { ...cur.fuentes } : {};
    fuentes.place_name = '⭐ Google';
    if (patch.puntos_fuertes) fuentes.puntos_fuertes = '⭐ Google';
    if (patch.testimonios) fuentes.testimonios = '⭐ Google';
    patch.fuentes = fuentes;
    writeDna(uid, { ...cur, ...patch });

    res.json({ ok: true, place_name: r.place_name, rating: r.rating, partial: !!r.partial, reviews_analyzed: r.reviews_analyzed });
  } catch (e) {
    console.error('[places/analyze]:', e.message);
    res.status(400).json({ error: e.message || 'No pudimos buscar tu negocio en Google, probá de nuevo en un rato' });
  }
});

app.get('/api/places/status', requireAuth, (req, res) => {
  try {
    const dna = readDna(req.session.userId);
    const analyzedAt = dna.places_analyzed_at || '';
    if (!analyzedAt) return res.json({ ok: false, has_key: !!String(process.env.GOOGLE_PLACES_KEY || '').trim() });
    res.json({
      ok: true,
      has_key: !!String(process.env.GOOGLE_PLACES_KEY || '').trim(),
      analyzed_at: analyzedAt,
      place_name: dna.place_name || '',
      rating: dna.place_rating || 0,
      total_ratings: dna.place_total_ratings || 0,
      puntos_fuertes: Array.isArray(dna.puntos_fuertes) ? dna.puntos_fuertes : [],
      testimonios: Array.isArray(dna.testimonios) ? dna.testimonios : [],
      partial: !!dna.places_partial,
    });
  } catch (e) {
    res.json({ ok: false, has_key: false });
  }
});

// ---------- Track 5 — Historias recientes de IG ("Expertos en información") ----------
// La Graph API oficial solo da las historias de las últimas 24h
// (/{ig-user-id}/stories); no existe endpoint de archivo. Se extraen promos y
// anuncios del texto visible con visión gpt-4o (detail low, solo imágenes).
// Esto SOLO lee y analiza: nunca publica nada.
app.post('/api/ig/mine-stories', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;
    const s = getSettings(uid);
    if (!s.ig_user_id || !s.ig_access_token) {
      return res.status(400).json({ error: 'Conectá tu Instagram para que podamos leer tus historias' });
    }
    const apiKey = s.openai_key || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return res.status(400).json({ error: 'Falta configurar la clave de OpenAI' });
    const { analyzeStories, storiesDnaPatch } = require('./ig-stories');
    const r = await analyzeStories(s.ig_user_id, s.ig_access_token, apiKey);
    if (!r.ok) return res.status(400).json({ error: r.error || 'No pudimos leer tus historias, probá de nuevo en un rato' });
    const cur = readDna(uid);
    writeDna(uid, { ...cur, ...storiesDnaPatch(cur, r) }); // merge: nunca pisar otros campos ni fuentes
    res.json({ ok: true, stories: r.stories_count, promos: r.promos, anuncios: r.anuncios });
  } catch (e) {
    console.error('[ig/mine-stories]:', e.message);
    res.status(400).json({ error: 'No pudimos analizar tus historias, probá de nuevo en un rato' });
  }
});

app.get('/api/ig/stories-status', requireAuth, (req, res) => {
  try {
    const dna = readDna(req.session.userId);
    const analyzedAt = dna.stories_analyzed_at || '';
    if (!analyzedAt) return res.json({ ok: false });
    const promos = Array.isArray(dna.stories_promos) ? dna.stories_promos.length : 0;
    const anuncios = Array.isArray(dna.stories_anuncios) ? dna.stories_anuncios.length : 0;
    res.json({ ok: true, analyzed_at: analyzedAt, stories: Number(dna.stories_count) || 0, promos, anuncios });
  } catch (e) {
    res.json({ ok: false });
  }
});

// Ring buffer de últimos errores de generación (diagnóstico admin, sin secretos).
const LAST_ERRORS = [];
function logGenError(where, err) {
  try {
    LAST_ERRORS.unshift({ at: new Date().toISOString(), where, msg: String((err && err.message) || err || '').slice(0, 300) });
    if (LAST_ERRORS.length > 20) LAST_ERRORS.length = 20;
  } catch (e) {}
}
// BUILD_ID: cambiar en cada zip consolidado. Sirve para verificar desde el
// navegador que producción está corriendo el código nuevo:
//   https://postyhacetodo.com/api/version  →  {"build":"..."}.
// Si después de subir muestra un BUILD_ID viejo, algún archivo se subió
// duplicado (ej. "server 2.js" en vez de reemplazar "server.js").
const BUILD_ID = '20261008-v87';
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'posta', demoDefault: true }));
app.get('/api/qa-audit', (req, res) => {
  try {
    db.exec("CREATE TABLE IF NOT EXISTS qa_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT (datetime('now')), passed INTEGER, result TEXT)");
    const rows = db.prepare("SELECT id, created_at, passed, substr(result,1,1200) AS result FROM qa_audit ORDER BY id DESC LIMIT 100").all();
    const stats = db.prepare("SELECT COUNT(*) AS n, SUM(passed) AS ok FROM qa_audit WHERE created_at > datetime('now','-7 days')").get();
    res.json({ ok: true, stats, rows });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.get('/api/version', (req, res) => res.json({ ok: true, build: BUILD_ID,
  // Diagnóstico sin exponer secretos: ¿hay clave de OpenAI configurada?
  openai: Boolean(process.env.OPENAI_API_KEY),
}));
// Diagnóstico admin: últimos errores de generación (requiere login).
app.get('/api/diag', requireAuth, (req, res) => res.json({ ok: true, build: BUILD_ID, errors: LAST_ERRORS }));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ANTI-CRASH (2026-10-02): en Express 4 + Node 24, un throw en un handler async
// sin try/catch = unhandled rejection = el proceso MUERE para todos los usuarios.
// Esto lo convierte en log en vez de crash. (Igual hay que poner try/catch en
// los handlers, esto es la red de seguridad.)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL-SAFE] unhandledRejection capturada (el servidor sigue vivo):', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL-SAFE] uncaughtException:', err && err.message ? err.message : err);
  // En uncaughtException sí conviene reiniciar, pero loggeamos antes.
});

app.listen(PORT, () => {
  console.log(`[posta] Corriendo en http://localhost:${PORT} (${NODE_ENV})`);
  console.log(`[posta] Mercado Pago: ${mp.mpConfigured() ? 'configurado ✅' : 'no configurado (pagos desactivados)'}`);
  startScheduler(db);
  startTokenRefresh();
});

// Track 4 "Pipeline perpetuo": el cron semanal de scheduler.js hace require
// perezoso de este módulo (ya cargado) para llamar al barrido. No requerir
// scheduler.js desde acá abajo: server.js ya lo requiere arriba.
module.exports = { nextWeekSweep, generateWeekDrafts, nextWeekEligible, maybeStartRebuild, revalidateReferralDiscount, maybeReferralNudge, conceptShotGenerate: conceptShotGenerateQueued, autoArmWeek, scheduleAllDrafts, autoWeekEnabled, assignScheduleSlots, acceptAllDrafts, retrySweepFailures, backfillThisWeek };
