// device-tokens.js — (Frente 5, 2026-10-23) Tokens de larga duración POR
// DISPOSITIVO para las "cuentas guardadas en este dispositivo".
//
// Problema que resuelve: la sesión (cookie, store SQLite) ya dura 365 días
// con rolling, pero si la cookie se pierde (navegador nuevo, datos borrados,
// otro perfil) el cliente tenía que tipear email + contraseña de nuevo. Con
// este token, el navegador guarda LA CUENTA (email + token) en localStorage y
// la pantalla de entrada ofrece "Continuar como <email>" de un toque.
//
// Seguridad (no negociable, espejo del precedente magic_tokens/password_resets):
// · El token en claro SOLO vive en el localStorage del dispositivo que se
//   logueó. En el servidor se guarda ÚNICAMENTE su hash SHA-256 — jamás el
//   token en claro (ni en la tabla, ni en logs).
// · La contraseña NUNCA participa: no se guarda en el cliente en ninguna
//   forma; este módulo ni la conoce.
// · ROTACIÓN EN CADA USO: cada intercambio revoca el token presentado y
//   emite uno nuevo. Un token robado y usado deja afuera al ladrón en el
//   próximo uso legítimo (y viceversa: el reuso de un token viejo FALLA).
// · Revocación individual por token/dispositivo (la × de la fila) y masiva
//   por usuario (reset de contraseña: si la cuenta estaba comprometida,
//   ningún dispositivo guardado queda adentro).
// · Vida: 60 días desde la emisión; cada intercambio renueva la ventana.
//
// Esquema ADITIVO e idempotente (CREATE TABLE IF NOT EXISTS al primer uso,
// mismo patrón que magic_tokens en db.js): sin migraciones destructivas.
'use strict';
const crypto = require('crypto');

const TTL_MS = 60 * 24 * 3600 * 1000; // ~60 días

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

let _ready = false;
function ensureSchema(db) {
  if (_ready) return;
  db.exec(`CREATE TABLE IF NOT EXISTS device_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  )`);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id, revoked)`); } catch (e) { /* índice accesorio */ }
  _ready = true;
}

// Emite un token nuevo para (usuario, este dispositivo). Devuelve el token
// EN CLARO una sola vez (para entregárselo al cliente); en la base queda
// solo el hash.
function issue(db, userId, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + TTL_MS;
  db.prepare('INSERT INTO device_tokens (user_id, token_hash, created_at, last_used_at, expires_at, revoked) VALUES (?,?,?,?,?,0)')
    .run(userId, hashToken(token), now, 0, expiresAt);
  return { token, expiresAt };
}

// Intercambio con rotación: valida el token presentado y, si sirve, lo
// revoca y emite el siguiente de la cadena. Devuelve { userId, token,
// expiresAt } o null (inválido / vencido / revocado / reutilizado).
function exchange(db, token, nowMs) {
  ensureSchema(db);
  const now = nowMs || Date.now();
  const presented = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(presented)) return null;
  const th = hashToken(presented);
  const row = db.prepare('SELECT * FROM device_tokens WHERE token_hash = ?').get(th);
  if (!row || row.revoked) return null;
  if (row.expires_at <= now) {
    // Vencido: queda revocado para siempre (limpieza oportunista).
    try { db.prepare('UPDATE device_tokens SET revoked = 1 WHERE id = ?').run(row.id); } catch (e) {}
    return null;
  }
  // Rotación atómica para este proceso (node:sqlite es síncrono): el viejo
  // muere ANTES de nacer el nuevo; un segundo uso del mismo token ya no pasa.
  db.prepare('UPDATE device_tokens SET revoked = 1, last_used_at = ? WHERE id = ?').run(now, row.id);
  const fresh = issue(db, row.user_id, now);
  return { userId: row.user_id, token: fresh.token, expiresAt: fresh.expiresAt };
}

// Revoca UN token (la × de "quitar cuenta de este dispositivo"). Devuelve
// true si existía una fila viva con ese hash. Idempotente.
function revoke(db, token) {
  ensureSchema(db);
  const presented = String(token || '');
  if (!presented) return false;
  const r = db.prepare('UPDATE device_tokens SET revoked = 1 WHERE token_hash = ? AND revoked = 0').run(hashToken(presented));
  return !!(r && r.changes);
}

// Revoca TODOS los tokens de un usuario (reset de contraseña / compromiso).
function revokeAllForUser(db, userId) {
  ensureSchema(db);
  const r = db.prepare('UPDATE device_tokens SET revoked = 1 WHERE user_id = ? AND revoked = 0').run(userId);
  return r && r.changes ? r.changes : 0;
}

// Fila cruda por token en claro (SOLO para tests/diagnóstico: permite
// verificar que lo guardado es el hash y nunca el token).
function rowForToken(db, token) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM device_tokens WHERE token_hash = ?').get(hashToken(token)) || null;
}

module.exports = { TTL_MS, hashToken, ensureSchema, issue, exchange, revoke, revokeAllForUser, rowForToken };
