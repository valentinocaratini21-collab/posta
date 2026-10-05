// Base de datos SQLite — Posta (usa node:sqlite integrado, sin dependencias nativas)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'posta.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT DEFAULT '',
  category TEXT DEFAULT 'otro',
  tone TEXT DEFAULT 'canchero',
  description TEXT DEFAULT '',
  ig_username TEXT DEFAULT '',
  ig_connected INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  openai_key TEXT DEFAULT '',
  demo_mode INTEGER DEFAULT 1,
  meta_app_id TEXT DEFAULT '',
  meta_app_secret TEXT DEFAULT '',
  ig_user_id TEXT DEFAULT '',
  ig_page_id TEXT DEFAULT '',
  ig_access_token TEXT DEFAULT '',
  image_base_url TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ig_permalink TEXT DEFAULT '',
  error TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  carousel_paths TEXT DEFAULT '',
  tipo TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(status, scheduled_at);
`);
// Historial de versiones de borradores: cada edición por chat guarda la versión
// anterior para poder "volver atrás" cuando el cliente lo pide.
db.exec(`
CREATE TABLE IF NOT EXISTS post_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_post_versions_post ON post_versions(post_id, id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);
`);

// Migraciones livianas para DBs existentes
try { db.exec(`ALTER TABLE profiles ADD COLUMN competitors TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE profiles ADD COLUMN goal TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN ig_token_issued_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN ig_token_warning INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN ig_embed_url TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN preferred_palette INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN pexels_key TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Estilos de imagen (image-styles.js): estilo usado en cada borrador + motivo del pick.
try { db.exec(`ALTER TABLE posts ADD COLUMN style_code TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN style_reason TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN intent TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN needs_image INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN product_ref TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Hook engine (hooks.js): hook usado en cada borrador + rotación 8 semanas.
try { db.exec(`ALTER TABLE posts ADD COLUMN hook_id TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Learning loop (learning.js): 1 = métricas ya ingeridas.
try { db.exec(`ALTER TABLE posts ADD COLUMN learning_ingested INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Costos IA (costs.js, 2026-10-02): tokens cacheados por prompt caching.
try { db.exec(`ALTER TABLE api_costs ADD COLUMN cached_tokens INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Abrir y listo (2026-10-03): 1 = Posty arma y programa la semana solo.
try { db.exec(`ALTER TABLE users ADD COLUMN auto_week INTEGER NOT NULL DEFAULT 1`); } catch (e) { /* ya existe */ }
db.exec(`CREATE TABLE IF NOT EXISTS hook_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  hook_id TEXT NOT NULL DEFAULT '',
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_hook_usage_user ON hook_usage(user_id, used_at)`);
try { require('./learning').initLearningTables(db); } catch (e) { console.error('[learning] init:', e.message); }
// Stories automáticas + community + reactive (2026-10-01).
try { require('./community').initCommunityTables(db); } catch (e) { console.error('[community] init:', e.message); }
try { db.exec(`ALTER TABLE settings ADD COLUMN reactive_enabled INTEGER DEFAULT 1`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN reactive_lat REAL DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN reactive_lon REAL DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN reactive_label TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Style Lock: logo de marca fijo del cliente (asset kind='logo', se sube una vez,
// referencia en todo lo generado). Refactor 2026-09-30: antes vivía en settings
// (mascot_path / mascot_candidate / mascot_candidate_dismissed); ahora el logo
// confirmado es un asset y la candidata pendiente vive en logo_candidate.
// Para DBs existentes que ya tengan las columnas viejas: DROP COLUMN (SQLite
// ≥3.35); si falla se ignora — las columnas huérfanas no se usan.
try { db.exec(`ALTER TABLE settings DROP COLUMN mascot_path`); } catch (e) { /* no existe / no soportado */ }
try { db.exec(`ALTER TABLE settings DROP COLUMN mascot_candidate`); } catch (e) { /* no existe / no soportado */ }
try { db.exec(`ALTER TABLE settings DROP COLUMN mascot_candidate_dismissed`); } catch (e) { /* no existe / no soportado */ }
// Logo auto-extraído: candidata descargada sola de la foto de perfil del IG (style-visual.js)
try { db.exec(`ALTER TABLE settings ADD COLUMN logo_candidate TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN logo_candidate_dismissed INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'trial'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN plan_status TEXT DEFAULT 'trial'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// 🧠 Niveles de conocimiento de Posty (posty-level.js): último nivel festejado
// y marca de agua del resumen semanal de aprendizaje.
try { db.exec(`ALTER TABLE users ADD COLUMN posty_level INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN posty_digest_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Para detectar "reglas de estilo recién activadas" en el resumen semanal.
try { db.exec(`ALTER TABLE style_rules ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`); } catch (e) { /* ya existe */ }
// Todo-en-uno v2: métricas, mejor horario, funnel y comentarios
try { db.exec(`ALTER TABLE posts ADD COLUMN ig_media_id TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN carousel_paths TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN tipo TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Track 4 "Pipeline perpetuo": a qué semana (lunes, 'YYYY-MM-DD') pertenece cada
// posteo. '' = semana corriente / legado (sin filtrar, como antes).
try { db.exec(`ALTER TABLE posts ADD COLUMN week_key TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_week ON posts(user_id, week_key, status)`); } catch (e) { /* ya existe */ }
// Track 4 (agregado "reconstruir con otro enfoque"): tope de 2 reconstrucciones
// por semana y usuario. Persistido en DB (no solo memoria) para que sobreviva reinicios.
db.exec(`CREATE TABLE IF NOT EXISTS rebuild_counts (
  user_id INTEGER NOT NULL,
  week_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, week_key)
);`);
try { db.exec(`ALTER TABLE post_signals ADD COLUMN caption TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN best_hour INTEGER DEFAULT 19`); } catch (e) { /* ya existe */ }
db.exec(`CREATE TABLE IF NOT EXISTS post_metrics (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS funnel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event TEXT NOT NULL,
  meta TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_funnel_event ON funnel_events(event, created_at)`);
// Analytics propio: eventos del frontend (pantallas y acciones). user_id puede ser
// NULL (visitantes anónimos de /prueba); session_id los agrupa por sesión.
db.exec(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  props TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_sid ON events(session_id, created_at)`);
db.exec(`CREATE TABLE IF NOT EXISTS comment_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ig_comment_id TEXT NOT NULL UNIQUE,
  ig_media_id TEXT DEFAULT '',
  username TEXT DEFAULT '',
  text TEXT DEFAULT '',
  suggested TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// Billetera de publicidad + pautas (boost de posteos ganadores)
db.exec(`CREATE TABLE IF NOT EXISTS ad_wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ad_boosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER,
  ig_media_id TEXT NOT NULL DEFAULT '',
  budget_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  spend_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ARS',
  status TEXT NOT NULL DEFAULT 'pending',
  meta_campaign_id TEXT NOT NULL DEFAULT '',
  meta_adset_id TEXT NOT NULL DEFAULT '',
  meta_ad_id TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT 'engagement',
  duration_days INTEGER NOT NULL DEFAULT 7,
  last_spend_cents INTEGER NOT NULL DEFAULT 0,
  last_reach INTEGER NOT NULL DEFAULT 0,
  last_impressions INTEGER NOT NULL DEFAULT 0,
  stats_updated_at TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ad_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'topup',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  ref TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
)`);
try { db.exec(`ALTER TABLE users ADD COLUMN mp_preapproval_id TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN media_type TEXT DEFAULT 'image'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN source_topic TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN source_angle TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN brand_logo TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN brand_colors TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN last_ig_user_id TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }

db.exec(`
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'photo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id, kind);
`);

// Demo pública: rate limit de generaciones por IP por día (5/día)
db.exec(`
CREATE TABLE IF NOT EXISTS demo_usage (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);
`);

// Prueba completa: una sola vez por IP (sin registro)
db.exec(`
CREATE TABLE IF NOT EXISTS trial_usage (
  ip TEXT PRIMARY KEY,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Prueba completa: cache de la semana generada, clave por @ de Instagram (72h).
// Si el mismo @ vuelve dentro de 3 días, ve su semana al instante sin
// regenerar (no gasta IA). Reemplaza al bloqueo permanente por IP.
db.exec(`
CREATE TABLE IF NOT EXISTS trial_cache (
  ig TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);
// Email del lead de la prueba (abandono de trial, 2026-09-30): el visitante
// puede dejar su email en la pantalla de resultados; si no se registra en
// ~24h, recibe UN solo aviso de que su semana sigue guardada.
try { db.exec(`ALTER TABLE trial_cache ADD COLUMN email TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE trial_cache ADD COLUMN abandon_sent INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }

// Eliminación de datos (requerido por Meta): solicitudes vía signed_request
db.exec(`
CREATE TABLE IF NOT EXISTS ig_avatar_cache (
  username TEXT PRIMARY KEY,
  pic_url TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS deletion_requests (
  code TEXT PRIMARY KEY,
  meta_user_id TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nudges_user ON nudges(user_id, sent_at);
`);

// Loop inteligente fase 1: señales del cliente por posteo (qué le gustó y qué no)
// client_signal: approved (salió sin cambios) | edited (lo editó antes) | rejected (lo canceló/eliminó o 👎)
db.exec(`
CREATE TABLE IF NOT EXISTS post_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  idea_text TEXT DEFAULT '',
  template TEXT DEFAULT '',
  caption_style TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  hashtags TEXT DEFAULT '',
  scheduled_for TEXT DEFAULT '',
  rubro TEXT DEFAULT '',
  client_signal TEXT NOT NULL DEFAULT 'approved',
  week_key TEXT DEFAULT '',
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_signals_user_week ON post_signals(user_id, week_key);
CREATE INDEX IF NOT EXISTS idx_signals_signal ON post_signals(user_id, client_signal);
CREATE TABLE IF NOT EXISTS milestones_seen (
  user_id INTEGER NOT NULL,
  milestone INTEGER NOT NULL,
  seen_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, milestone)
);
CREATE TABLE IF NOT EXISTS pillars_cache (
  user_id INTEGER PRIMARY KEY,
  month_key TEXT DEFAULT '',
  pillars_json TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS recycled_posts (
  post_id INTEGER PRIMARY KEY,
  new_post_id INTEGER,
  created_at INTEGER
);
`);
// FASE 5 (2026-10-05): distingue la señal MANUAL del cliente de la auto-marcada
// por el scheduler (todo lo publicado sin veto se auto-marca 'approved' y
// diluye el taste). 0 = manual (o anterior), 1 = auto.
try { db.exec(`ALTER TABLE post_signals ADD COLUMN auto_signal INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }

// Referidos: cada usuario tiene su código; referred_by apunta al usuario que lo trajo
try { db.exec(`ALTER TABLE users ADD COLUMN referral_code TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN referred_by INTEGER DEFAULT NULL`); } catch (e) { /* ya existe */ }
// 50% off por referidos aplicado en MP (1 = la preapproval está al 50%). Idempotencia de revalidateReferralDiscount.
try { db.exec(`ALTER TABLE users ADD COLUMN referral_discount INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Nudge "te falta 1": 1 = ya se avisó (se envía una sola vez, idempotente).
try { db.exec(`ALTER TABLE users ADD COLUMN referral_nudge_sent INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// "Posty festeja tus wins": fecha (YYYY-MM-DD) del último festejo. Tope: 1 por día por usuario.
try { db.exec(`ALTER TABLE users ADD COLUMN last_win_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// PWA instalada en el teléfono (1 = instalada) y opt-out de emails semanales
try { db.exec(`ALTER TABLE users ADD COLUMN pwa_installed INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN email_opt_out INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Email de MercadoPago del usuario (puede diferir del email de la cuenta)
try { db.exec(`ALTER TABLE users ADD COLUMN mp_payer_email TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Festejo de primera publicación: 1 = ya se mostró (no repetir)
try { db.exec(`ALTER TABLE users ADD COLUMN publish_celebrated INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Misión de fotos semanal: 3 fotos concretas por semana (una fila por usuario/semana)
db.exec(`CREATE TABLE IF NOT EXISTS photo_missions (
  user_id INTEGER NOT NULL,
  week_key TEXT NOT NULL,
  shots TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, week_key)
);`);

// Trial de 10 días: vencimiento de la prueba gratis (milisegundos epoch)
try { db.exec(`ALTER TABLE users ADD COLUMN trial_ends_at INTEGER`); } catch (e) { /* ya existe */ }
// Extensión manual de trial (soporte): si está vigente, manda sobre el clamp de TRIAL_DAYS
try { db.exec(`ALTER TABLE users ADD COLUMN trial_extended_until INTEGER`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN mp_base_amount INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN mp_mult REAL DEFAULT 1`); } catch (e) { /* ya existe */ }

// Registro permanente de cuentas de Instagram usadas (anti trial duplicado):
// un IG = una sola prueba gratis, aunque lo desconecten o borren la cuenta
try {
  db.exec(`
CREATE TABLE IF NOT EXISTS ig_registry (
  ig_user_id TEXT PRIMARY KEY,
  first_user_id INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
} catch (e) { /* ya existe */ }
// Chat consultor: historial persistente entre sesiones + idea cerrada pendiente
db.exec(`
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chatmsg_user ON chat_messages(user_id, id);
-- Mensajes proactivos de la IA (pedidos por chat, no tarjetas): 1 por tipo cada 7 días
CREATE TABLE IF NOT EXISTS proactive_asks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, kind)
);
CREATE TABLE IF NOT EXISTS chat_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  idea_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS business_dna (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dna_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS style_rules (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, rule_key)
);
CREATE TABLE IF NOT EXISTS ig_visual_style (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL DEFAULT '',
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ig_caption_style (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL DEFAULT '',
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS client_briefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio_raw TEXT DEFAULT '',
  bio_mined_json TEXT NOT NULL DEFAULT '{}',
  brief_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ig_analysis (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Medición de gasto de IA por función (palanca anti-quemado): cada llamada a
-- OpenAI loguea tokens reales (usage.*), modelo y feature. Sirve para saber
-- mañana el culpable exacto; no es facturación.
CREATE TABLE IF NOT EXISTS api_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  feature TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  in_tokens INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  images INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_costs_ts ON api_costs(ts);
CREATE INDEX IF NOT EXISTS idx_api_costs_feature ON api_costs(feature, ts);
-- Rate limits por usuario/día (server-side, persistente).
CREATE TABLE IF NOT EXISTS ai_rate (
  user_id INTEGER NOT NULL,
  feature TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, day)
);
-- Fotos que el modelo ya vio (para no reenviar el contenido pesado en cada mensaje).
CREATE TABLE IF NOT EXISTS chat_seen_photos (
  user_id INTEGER NOT NULL,
  photo_hash TEXT NOT NULL,
  last_sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, photo_hash)
);
`);
try {
  db.exec(`INSERT OR IGNORE INTO ig_registry (ig_user_id, first_user_id)
           SELECT ig_user_id, user_id FROM settings
           WHERE ig_user_id IS NOT NULL AND ig_user_id != ''`);
} catch (e) { /* noop */ }

// Backfill: usuarios en trial sin fecha de vencimiento → 10 días desde hoy
try {
  db.prepare(`UPDATE users SET trial_ends_at = ? WHERE (plan_status IS NULL OR plan_status = 'trial') AND trial_ends_at IS NULL`)
    .run(Date.now() + 10 * 24 * 3600 * 1000);
} catch (e) { /* noop */ }

// Backfill: códigos de referido para usuarios existentes
try {
  const rcrypto = require('crypto');
  const used = new Set(
    db.prepare(`SELECT referral_code FROM users WHERE referral_code IS NOT NULL AND referral_code != ''`)
      .all().map((r) => r.referral_code)
  );
  const missing = db.prepare(`SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''`).all();
  const upd = db.prepare(`UPDATE users SET referral_code = ? WHERE id = ?`);
  for (const u of missing) {
    let code;
    do { code = rcrypto.randomBytes(4).toString('hex'); } while (used.has(code));
    used.add(code);
    upd.run(code, u.id);
  }
} catch (e) { console.error('[posta] backfill referral_code:', e.message); }

// Rachas: semanas consecutivas armando la semana (píldora, celebraciones, emails)
db.exec(`
CREATE TABLE IF NOT EXISTS streaks (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  last_week TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL DEFAULT 0,
  fed_at INTEGER NOT NULL DEFAULT 0
);
`);
// Migración 2026-09-28: la racha vence a las 72h sin publicar → columna fed_at.
// Backfill: las rachas vivas reciben 72h de gracia desde el deploy.
try { db.exec(`ALTER TABLE streaks ADD COLUMN fed_at INTEGER NOT NULL DEFAULT 0`); } catch (e) {}
try { db.exec(`UPDATE streaks SET fed_at = ${Date.now()} WHERE current > 0 AND fed_at = 0`); } catch (e) {}

// Backfill: timezone vacío → default
try { db.exec(`UPDATE settings SET timezone='America/Argentina/Buenos_Aires' WHERE timezone IS NULL OR timezone=''`); } catch (e) {}

// Track B: análisis profundo de Instagram ("Conocer al cliente a fondo").
// learnings_json = {top_temas[], mejor_formato, patrones[], resumen} por usuario.
db.exec(`
CREATE TABLE IF NOT EXISTS content_learnings (
  user_id INTEGER PRIMARY KEY,
  learnings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Migración 2026-09-29 ("Conocer al cliente a fondo"): estrategia de cada posteo
// ("por qué este posteo vende para este negocio"), generada junto con la idea.
try { db.exec(`ALTER TABLE posts ADD COLUMN strategy_why TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }

// "Primera semana con rueditas" (2026-09-29): los primeros borradores de cada
// cliente pasan por revisión (humana o por agente) antes de ser visibles.
// needs_review=1 => el borrador existe pero el cliente no lo ve todavía.
try { db.exec(`ALTER TABLE posts ADD COLUMN needs_review INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN script TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN training_wheels INTEGER DEFAULT 1`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN posty_welcomed INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN client_name TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN media_asked_at INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Fix auditoría #2 (2026-09-30): cuántos posteos trajo la importación de la
// semana de /prueba. NULL = el usuario no vino de /prueba con @; 0 = vino pero
// la importación trajo 0 (cache vencido / payload roto → el welcome dice la
// verdad y ofrece rearmarla en 1 tap); >0 = posteos importados (continuidad).
try { db.exec(`ALTER TABLE users ADD COLUMN trial_import_n INTEGER`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN cancel_reason TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN utm_source TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN utm_campaign TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Gasto en ads (carga manual): para CAC cuando se prenda publicidad.
db.exec(`CREATE TABLE IF NOT EXISTS ad_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  campaign TEXT DEFAULT '',
  amount_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// Push notifications (Web Push / VAPID): suscripciones por dispositivo.
db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
)`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)`); } catch (e) { /* ya existe */ }

// Golden examples: posteos APROBADOS en revisión (tal cual quedaron tras la
// edición). El generador los usa como few-shot para "seguir haciéndolos así".
db.exec(`CREATE TABLE IF NOT EXISTS golden_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  visual_brief TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_golden_user ON golden_examples(user_id, created_at)`); } catch (e) { /* ya existe */ }

// "Posty te avisa" (2026-09-30): aprobación de posteos por notificación.
// notify_at/notified = aviso de aprobación enviado 3h antes de la hora programada.
// approval = pending (esperando) | approved (el cliente lo aprobó) |
//            auto (salió solo, fuera de la primera semana) | rejected (el cliente lo canceló).
try { db.exec(`ALTER TABLE posts ADD COLUMN notify_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN notified INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN approval TEXT DEFAULT 'pending'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN approved_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// "Posty festeja tus wins" (2026-09-30): 1 = este posteo ya fue festejado (no repetir).
try { db.exec(`ALTER TABLE posts ADD COLUMN celebrated INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// 🎉 Festejo de wins EN EL CHAT (2026-09-30): 1 = este posteo ya recibió su
// festejo de win en el chat (celebrateWinsChat en scheduler.js). No repetir jamás.
try { db.exec(`ALTER TABLE posts ADD COLUMN win_celebrated INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// 📊 Tus números (2026-09-30): último conteo de seguidores traído de IG
// (si la API falla, se muestra este caché en vez de un cero mentiroso).
try { db.exec(`ALTER TABLE users ADD COLUMN ig_followers INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Primera publicación del usuario: marca el inicio de su "primera semana"
// (durante esos 7 días los posteos requieren aprobación explícita).
try { db.exec(`ALTER TABLE users ADD COLUMN first_post_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Paywall (2026-09-30): email "mañana se termina tu prueba" — 1 = ya enviado
// (un solo intento; el cron lo setea ANTES de enviar, anti-spam).
try { db.exec(`ALTER TABLE users ADD COLUMN trial_expiry_email_sent INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Paywall (2026-09-30, fix auditoría #1): el scheduler pausa los posteos de
// quien no tiene plan activo ni trial vigente y avisa UNA vez en el chat.
// trial_pause_notified = 1 → ya avisado (se setea ANTES de insertar el mensaje,
// anti-spam ante doble corrida); se resetea a 0 cuando reactiva su plan, por
// si vuelve a vencer alguna vez.
try { db.exec(`ALTER TABLE users ADD COLUMN trial_pause_notified INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Magia de primera apertura (2026-09-30):
// - source: origen del posteo ('trial' = importado de /prueba por importTrialWeek).
//   Es el marcador confiable de "semana importada de la prueba" (antes no
//   había columna de origen; importTrialWeek solo dejaba el prefijo
//   image_path '/media/trial-').
// - client_photo: 1 = el diseño de este posteo usa una FOTO REAL del cliente
//   (subida en /prueba o por rediseño), detectado en el import desde
//   out.design.posts[i].photo ({userPhoto:true} o dataURL); 0 = foto de stock
//   o generado. Sirve la heurística de first_pick.
try { db.exec(`ALTER TABLE posts ADD COLUMN source TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN client_photo INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Backfill: filas importadas antes de esta migración (source='') se marcan
// 'trial' por el prefijo de image_path que solo escribe importTrialWeek.
// client_photo queda en 0 para esas filas (no se puede determinar a posteriori
// con confianza: el trial_cache expira a las 72h y no está linkeado al user).
try { db.exec(`UPDATE posts SET source = 'trial' WHERE (source IS NULL OR source = '') AND image_path LIKE '/media/trial-%'`); } catch (e) { /* columna aún no existe */ }
// Magic link (login sin contraseña, 2026-09-30): tokens de un solo uso,
// 15 minutos de vida. payload = JSON con trial_ig, ref, utm y trial_profile.
db.exec(`CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER,
  expires_at INTEGER,
  used INTEGER DEFAULT 0
)`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_magic_tokens_email ON magic_tokens(email, created_at)`); } catch (e) { /* ya existe */ }

// 4 PUNTOS (2026-10-02): autopiloto + proactivo + insights + resumen semanal.
// Filtro de calidad: score 0-100 y detalle de checks en JSON.
try { db.exec(`ALTER TABLE users ADD COLUMN autopilot_enabled INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN proactive_enabled INTEGER DEFAULT 1`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN quality_score INTEGER DEFAULT NULL`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN quality_checks TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN auto_published INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Engagement para insights ("te muestro que funciona").
try { db.exec(`ALTER TABLE posts ADD COLUMN ig_likes INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN ig_comments INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN ig_reach INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN insights_updated_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
// Aviso pre-autopiloto (2026-10-02): push 30 min antes de publicar solo.
try { db.exec(`ALTER TABLE posts ADD COLUMN autopilot_notified INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Autopiloto graduado (2026-10-02): se desbloquea a las 10 aprobaciones limpias.
try { db.exec(`ALTER TABLE users ADD COLUMN clean_approvals INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN autopilot_offered INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Proactivo estratégico: flag para no repetir el aviso de trial.
try { db.exec(`ALTER TABLE users ADD COLUMN proactive_trial_warned INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// 6 FUNCIONALIDADES (2026-10-03):
// 1. Horarios óptimos: mejor hora para publicar según audiencia.
try { db.exec(`ALTER TABLE users ADD COLUMN best_hour INTEGER DEFAULT 10`); } catch (e) { /* ya existe */ }
// 3. Banco de ideas: guardar ideas para después.
db.exec(`CREATE TABLE IF NOT EXISTS idea_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  angle TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used INTEGER DEFAULT 0
)`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_idea_bank_user ON idea_bank(user_id, used)`); } catch (e) {}
// 5. Test A/B: dos captions por posteo, se trackea el ganador.
try { db.exec(`ALTER TABLE posts ADD COLUMN caption_b TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN ab_winner TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }

// FASE 1 (2026-10-05): una sola escalera de confianza — trust_level 0/1/2.
// Unifica los 3 mecanismos redundantes: training_wheels, autopilot_enabled +
// 10 aprobaciones limpias, y el gate de primera semana en processDuePosts.
// 0 = todo pasa por revisión/aprobación; 1 = publica solo con aviso previo
// (freno de emergencia); 2 = autopiloto pleno (aviso previo opt-in).
// Las columnas viejas se MANTIENEN (lecturas existentes no se rompen);
// autopilot_enabled queda espejado de trust_level>=2.
try { db.exec(`ALTER TABLE users ADD COLUMN trust_level INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Semanas consecutivas en auto sin vetos ni fallos (graduación a nivel 2: 3).
try { db.exec(`ALTER TABLE users ADD COLUMN auto_weeks_clean INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Opt-in del aviso pre-publicación (30 min) en nivel 2 (en nivel 1 es obligatorio).
try { db.exec(`ALTER TABLE users ADD COLUMN autopilot_prenotify INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Backfill idempotente (corre en cada boot, solo sube de nivel): nadie regresa
// de nivel por la migración — conserva lo ganado con los mecanismos viejos.
try { db.exec(`UPDATE users SET trust_level = 2 WHERE COALESCE(autopilot_enabled, 0) = 1 AND COALESCE(trust_level, 0) < 2`); } catch (e) {}
try { db.exec(`UPDATE users SET trust_level = 1 WHERE COALESCE(trust_level, 0) < 1 AND (COALESCE(training_wheels, 1) = 0 OR (SELECT COUNT(*) FROM golden_examples ge WHERE ge.user_id = users.id) >= 5 OR (SELECT COUNT(*) FROM posts p WHERE p.user_id = users.id AND p.status = 'published') >= 5)`); } catch (e) {}

module.exports = db;
