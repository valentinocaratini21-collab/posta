// meta-deauthorize.js — Deauthorize callback de Meta (Frente 4b, 2026-10-23).
//
// Cuando un usuario desautoriza la app desde Facebook/Instagram, Meta hace
// POST form-encoded con `signed_request` (HMAC-SHA256 con el App Secret)
// a la Deauthorize Callback URL configurada en el panel. Esta es la pieza
// que faltaba: el panel tenía el campo VACÍO porque la ruta no existía.
//
// URL para pegar en el panel de Meta:
//   https://postycommunitymanager.com/api/meta/deauthorize
//
// Comportamiento (mismo patrón que /api/data-deletion, server.js):
// · Firma válida → BAJA LÓGICA de la conexión IG de la cuenta: se limpian
//   ig_user_id/ig_page_id/ig_access_token (como /api/ig/disconnect), se
//   guarda last_ig_user_id, profiles.ig_connected=0 y quedan la marca de
//   revocación (settings.ig_revoked_at / ig_revoked_reason='meta_deauthorize').
//   NO se borra NINGÚN dato del cliente (posteos, assets, cuenta: intactos;
//   borrar datos es el flujo separado de /api/data-deletion).
// · Cada intento queda registrado en meta_deauthorize_events (durable y
//   consultable vía GET /api/admin/meta-deauthorize-events).
// · Firma inválida → 400, sin tocar ninguna conexión, evento registrado.
// · Secreto NO configurado → FAIL-CLOSED: no se desautoriza a nadie, el
//   intento queda registrado (status='secret_missing') y se responde 503
//   controlado (nunca un crash). El secreto sale del entorno:
//   META_APP_SECRET (fallback IG_APP_SECRET, mismo orden que el callback IG).
// · Cuenta sin conexión IG activa → 200 sano ({deauthorized:false}).
'use strict';

const crypto = require('crypto');

const REASON = 'meta_deauthorize';

// Secreto de la app desde el entorno (nunca de la DB: el callback llega sin
// sesión y sin saber de qué cuenta es hasta verificar la firma).
function metaAppSecret(env) {
  const e = env || process.env;
  return String(e.META_APP_SECRET || e.IG_APP_SECRET || '');
}

// Mismo verificador que parseMetaSignedRequest de server.js (data-deletion):
// <base64url(HMAC-SHA256(payload, secret))>.<base64url(payload JSON)>.
function parseSignedRequest(signedRequest, secret) {
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

function ensureTables(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS meta_deauthorize_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meta_user_id TEXT DEFAULT '',
      user_id INTEGER,
      status TEXT NOT NULL DEFAULT '',
      reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_meta_deauth_meta ON meta_deauthorize_events(meta_user_id, created_at)`);
  } catch (e) { /* defensivo: el registro nunca debe tumbar el callback */ }
  // Marca de revocación sobre la conexión (baja lógica con timestamp+motivo).
  try { db.exec(`ALTER TABLE settings ADD COLUMN ig_revoked_at TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
  try { db.exec(`ALTER TABLE settings ADD COLUMN ig_revoked_reason TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
}

function recordEvent(db, { metaUserId, userId, status, reason }) {
  try {
    ensureTables(db);
    const r = db.prepare('INSERT INTO meta_deauthorize_events (meta_user_id, user_id, status, reason) VALUES (?, ?, ?, ?)')
      .run(String(metaUserId || ''), userId || null, String(status || ''), String(reason || ''));
    return Number(r.lastInsertRowid);
  } catch (e) { return 0; }
}

function listEvents(db, opts) {
  ensureTables(db);
  const o = opts || {};
  const limit = Math.min(Math.max(Number(o.limit || 100), 1), 500);
  if (o.metaUserId) {
    return db.prepare('SELECT * FROM meta_deauthorize_events WHERE meta_user_id = ? ORDER BY id DESC LIMIT ?')
      .all(String(o.metaUserId), limit);
  }
  return db.prepare('SELECT * FROM meta_deauthorize_events ORDER BY id DESC LIMIT ?').all(limit);
}

// Núcleo del callback, desacoplado de HTTP para poder testearlo sin red:
// devuelve { status, body } y server.js solo lo traduce a res.status().json().
function handleDeauthorize(db, signedRequest, secret) {
  ensureTables(db);
  // Fail-closed sin secreto: no se puede verificar NADA → no se toca ninguna
  // conexión; queda el intento registrado y Meta recibe un 503 controlado.
  if (!secret) {
    recordEvent(db, { status: 'secret_missing', reason: REASON });
    return { status: 503, body: { ok: false, error: 'meta_secret_not_configured', processed: false } };
  }
  const data = parseSignedRequest(signedRequest, secret);
  if (!data || !String(data.user_id || '')) {
    recordEvent(db, { status: 'invalid_signature', reason: REASON });
    return { status: 400, body: { ok: false, error: 'signed_request inválido', processed: false } };
  }
  const metaUserId = String(data.user_id);
  let s = null;
  try {
    s = db.prepare('SELECT user_id FROM settings WHERE ig_user_id = ?').get(metaUserId);
  } catch (e) {
    recordEvent(db, { metaUserId, status: 'error', reason: REASON });
    // 500 para que Meta reintente: el estado quedó incierto, no confirmamos.
    return { status: 500, body: { ok: false, error: 'no se pudo procesar la desautorización', processed: false } };
  }
  if (!s) {
    // Sin conexión IG activa: respuesta sana (idempotente ante reintentos).
    recordEvent(db, { metaUserId, status: 'no_connection', reason: REASON });
    return { status: 200, body: { ok: true, processed: false, deauthorized: false, reason: 'no_connection' } };
  }
  const uid = s.user_id;
  try {
    // Baja lógica — espejo de /api/ig/disconnect + marca de revocación.
    // last_ig_user_id conserva qué IG estaba conectado (detección de cambio
    // de cuenta si vuelve a conectar otro). Los datos del cliente NO se tocan.
    db.prepare(`UPDATE settings SET last_ig_user_id = ig_user_id, ig_user_id = '', ig_page_id = '',
        ig_access_token = '', ig_revoked_at = datetime('now'), ig_revoked_reason = ?,
        updated_at = datetime('now') WHERE user_id = ?`).run(REASON, uid);
    db.prepare('UPDATE profiles SET ig_connected = 0 WHERE user_id = ?').run(uid);
  } catch (e) {
    recordEvent(db, { metaUserId, userId: uid, status: 'error', reason: REASON });
    return { status: 500, body: { ok: false, error: 'no se pudo procesar la desautorización', processed: false } };
  }
  const eventId = recordEvent(db, { metaUserId, userId: uid, status: 'deauthorized', reason: REASON });
  return { status: 200, body: { ok: true, processed: true, deauthorized: true, event_id: eventId || undefined } };
}

module.exports = {
  REASON,
  metaAppSecret,
  parseSignedRequest,
  ensureTables,
  recordEvent,
  listEvents,
  handleDeauthorize,
};
