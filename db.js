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
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(status, scheduled_at);
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
try { db.exec(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'trial'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN plan_status TEXT DEFAULT 'trial'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
// Todo-en-uno v2: métricas, mejor horario, funnel y comentarios
try { db.exec(`ALTER TABLE posts ADD COLUMN ig_media_id TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
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
  hashtags TEXT DEFAULT '',
  scheduled_for TEXT DEFAULT '',
  rubro TEXT DEFAULT '',
  client_signal TEXT NOT NULL DEFAULT 'approved',
  week_key TEXT DEFAULT '',
  UNIQUE(user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_signals_user_week ON post_signals(user_id, week_key);
CREATE INDEX IF NOT EXISTS idx_signals_signal ON post_signals(user_id, client_signal);
`);

// Referidos: cada usuario tiene su código; referred_by apunta al usuario que lo trajo
try { db.exec(`ALTER TABLE users ADD COLUMN referral_code TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE users ADD COLUMN referred_by INTEGER DEFAULT NULL`); } catch (e) { /* ya existe */ }
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
CREATE TABLE IF NOT EXISTS chat_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  idea_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
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

module.exports = db;
