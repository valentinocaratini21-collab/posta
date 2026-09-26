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
try { db.exec(`ALTER TABLE users ADD COLUMN mp_preapproval_id TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE posts ADD COLUMN media_type TEXT DEFAULT 'image'`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN brand_logo TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN brand_colors TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }

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

// Eliminación de datos (requerido por Meta): solicitudes vía signed_request
db.exec(`
CREATE TABLE IF NOT EXISTS deletion_requests (
  code TEXT PRIMARY KEY,
  meta_user_id TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
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
// Email de MercadoPago del usuario (puede diferir del email de la cuenta)
try { db.exec(`ALTER TABLE users ADD COLUMN mp_payer_email TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }

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

// Backfill: timezone vacío → default
try { db.exec(`UPDATE settings SET timezone='America/Argentina/Buenos_Aires' WHERE timezone IS NULL OR timezone=''`); } catch (e) {}

module.exports = db;
