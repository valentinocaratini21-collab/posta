// venty-web-tokens.js — VENTY-WEB (slice 1-web, 2026-11-06): tokens Bearer
// para la app web de Venty en ventysalesmanager.com.
//
// Problema que resuelve: la sesión de Posta es una cookie SameSite=lax
// host-only y el navegador NO la manda en fetch cross-origin. La web se
// loguea por intercambio de código + token Bearer. Este módulo es el modelo
// device-tokens.js aplicado a Venty, con dos tablas:
//   · venty_codes: códigos de un solo uso, TTL 5 minutos (el canje).
//   · venty_web_tokens: tokens Bearer de larga duración (TTL 60 días).
//
// Seguridad (espejo de device-tokens.js / magic_tokens):
// · En claro SOLO vive en el cliente que se logueó. En el servidor se
//   guarda ÚNICAMENTE el hash SHA-256 — jamás el token ni el código en
//   claro (ni en la tabla, ni en logs).
// · ROTACIÓN EN CADA USO del refresh: cada intercambio revoca el token
//   presentado y emite uno nuevo. Un token robado y usado deja afuera al
//   ladrón en el próximo uso legítimo (y viceversa).
// · Revocación individual por token (Salir) y masiva por usuario (reset de
//   contraseña: ningún token web queda adentro).
// · Códigos de un solo uso: consumir marca used=1; un segundo uso FALLA.
// · Vida: código 5 min; token 60 días desde la emisión.
//
// Esquema ADITIVO e idempotente (CREATE TABLE IF NOT EXISTS al primer uso,
// mismo patrón que device_tokens): sin migraciones destructivas.
'use strict';
const crypto = require('crypto');

const TTL_TOKEN_MS = 60 * 24 * 3600 * 1000; // ~60 días
const TTL_CODE_MS = 5 * 60 * 1000; // 5 minutos

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

let _ready = false;
function ensureSchema(db) {
  if (_ready) return;
  db.exec(`CREATE TABLE IF NOT EXISTS venty_web_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    etiqueta TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    code_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  )`);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_venty_web_tokens_user ON venty_web_tokens(user_id, revoked)`); } catch (e) { /* índice accesorio */ }
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_venty_codes_user ON venty_codes(user_id, used)`); } catch (e) { /* índice accesorio */ }
  _ready = true;
}

// Emite un web token nuevo para un usuario. Devuelve el token EN CLARO una
// sola vez (para entregárselo al cliente); en la base queda solo el hash.
function issueWebToken(db, userId, etiqueta, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + TTL_TOKEN_MS;
  db.prepare('INSERT INTO venty_web_tokens (user_id, token_hash, etiqueta, created_at, last_used_at, expires_at, revoked) VALUES (?,?,?,?,?,?,0)')
    .run(userId, hashToken(token), String(etiqueta || 'web'), now, 0, expiresAt);
  return { token, expiresAt };
}

// Valida un web token presentado: formato, existe, no revocado, no vencido.
// Devuelve la fila (con user_id) o null. Actualiza last_used_at.
function lookupWebToken(db, token, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const presented = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(presented)) return null;
  const row = db.prepare('SELECT * FROM venty_web_tokens WHERE token_hash = ?').get(hashToken(presented));
  if (!row || row.revoked) return null;
  if (row.expires_at <= now) {
    try { db.prepare('UPDATE venty_web_tokens SET revoked = 1 WHERE id = ?').run(row.id); } catch (e) {}
    return null;
  }
  try { db.prepare('UPDATE venty_web_tokens SET last_used_at = ? WHERE id = ?').run(now, row.id); } catch (e) {}
  return row;
}

// Intercambio con rotación: valida el token presentado y, si sirve, lo
// revoca y emite el siguiente de la cadena. Devuelve { userId, token,
// expiresAt } o null.
function exchangeWebToken(db, token, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const row = lookupWebToken(db, token, now);
  if (!row) return null;
  db.prepare('UPDATE venty_web_tokens SET revoked = 1, last_used_at = ? WHERE id = ?').run(now, row.id);
  const fresh = issueWebToken(db, row.user_id, row.etiqueta || 'web', now);
  return { userId: row.user_id, token: fresh.token, expiresAt: fresh.expiresAt };
}

// Revoca UN web token. Devuelve true si existía una fila viva con ese hash.
function revokeWebToken(db, token) {
  ensureSchema(db);
  const presented = String(token || '');
  if (!presented) return false;
  const r = db.prepare('UPDATE venty_web_tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0').run(hashToken(presented));
  return !!(r && r.changes);
}

// Revoca TODOS los web tokens de un usuario (reset de contraseña).
function revokeAllForUser(db, userId) {
  ensureSchema(db);
  const r = db.prepare('UPDATE venty_web_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').run(userId);
  return r && r.changes ? r.changes : 0;
}

// Emite un código de un solo uso para un usuario. Devuelve el código EN
// CLARO una sola vez; en la base queda solo el hash.
function issueCode(db, userId, email, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const code = crypto.randomBytes(16).toString('hex');
  const expiresAt = now + TTL_CODE_MS;
  db.prepare('INSERT INTO venty_codes (user_id, email, code_hash, created_at, expires_at, used) VALUES (?,?,?,?,?,0)')
    .run(userId, String(email || ''), hashToken(code), now, expiresAt);
  return { code, expiresAt };
}

// Consume un código: si existe, no usado y no vencido, lo marca used=1 y
// devuelve el user_id. Cualquier otro caso devuelve null (y un código
// vencido queda marcado used para siempre, limpieza oportunista).
function consumeCode(db, code, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const presented = String(code || '');
  if (!/^[0-9a-f]{32}$/.test(presented)) return null;
  const row = db.prepare('SELECT * FROM venty_codes WHERE code_hash = ?').get(hashToken(presented));
  if (!row || row.used) return null;
  if (row.expires_at <= now) {
    try { db.prepare('UPDATE venty_codes SET used = 1 WHERE id = ?').run(row.id); } catch (e) {}
    return null;
  }
  db.prepare('UPDATE venty_codes SET used = 1 WHERE id = ?').run(row.id);
  return row.user_id;
}

// Revoca un código sin consumir (p. ej. si el email no salió: el código no
// debe quedar vivo). Devuelve true si existía una fila viva con ese hash.
function revokeCode(db, code) {
  ensureSchema(db);
  const presented = String(code || '');
  if (!presented) return false;
  const r = db.prepare('UPDATE venty_codes SET used = 1 WHERE code_hash = ? AND used = 0').run(hashToken(presented));
  return !!(r && r.changes);
}

// Fila cruda por token en claro (SOLO para tests/diagnóstico).
function rowForToken(db, token) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM venty_web_tokens WHERE token_hash = ?').get(hashToken(token)) || null;
}

module.exports = {
  TTL_TOKEN_MS, TTL_CODE_MS, hashToken, ensureSchema,
  issueWebToken, lookupWebToken, exchangeWebToken, revokeWebToken, revokeAllForUser,
  issueCode, consumeCode, revokeCode, rowForToken,
};
