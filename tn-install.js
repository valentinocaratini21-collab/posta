// tn-install.js — Instalación de Posty desde la Tienda de Aplicaciones
// de Tiendanube para un comerciante SIN sesión de Posty (brecha 2 de la
// homologación, app Partners ID 47715 — 2026-10-20).
//
// El problema: el flujo que ya existe nace ADENTRO de Posty — el dueño
// toca «Conectar Tiendanube» en Ajustes y el state firmado lleva su
// user_id. Pero quien instala desde la tienda hace el camino inverso:
// Tiendanube lo manda al redirect registrado (/api/connections/
// tiendanube/callback) con el `code` OAuth y SIN state nuestro ni
// sesión. Hoy ese aterrizaje cae en ?tn=error y la instalación queda
// rota (y el video obligatorio de homologación, imposible de filmar).
//
// La pieza: al llegar un code sin state, server.js lo canjea igual que
// siempre (exchangeCode) y guarda el token como INSTALACIÓN PENDIENTE
// en este módulo; el navegador sigue a la landing pública
// /tiendanube-instalar.html?t=<state> donde el comerciante crea su
// cuenta Posty (sin verificación de email, entra directo — reglas de
// Valentino) o entra con la que ya tiene, y claimPendingInstall
// empareja la conexión con su usuario. Recién ahí server.js corre el
// primer sync y el fundamento nace del catálogo/ventas de la tienda.
//
// Seguridad: la landing solo porta un state firmado HMAC (mismo patrón
// que tnStateFor de server.js) con vencimiento de 30 minutos y un id
// aleatorio; el token de Tiendanube vive SOLO en la base, jamás en la
// URL ni en el navegador. El claim es de un solo uso (consume la fila).
// Si la tienda ya estaba conectada a OTRO usuario, el claim la mueve:
// se corta la conexión anterior y su bloque sale del digest (una tienda
// tiene un solo dueño operativo en Posty).
//
// Módulo desacoplado: opera vía el handle `db`. El cableado en
// server.js (rama del callback + endpoints info/claim) va especificado
// en el paquete de homologación porque server.js es zona de otro build.
'use strict';

const crypto = require('crypto');
const tiendanube = require('./tiendanube.js');
const clientDigest = require('./client-digest.js');

const INSTALL_TTL_MS = 30 * 60 * 1000; // 30 min, igual que tnStateFor

function ensurePendingTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS tn_pending_installs (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      store_name TEXT DEFAULT '',
      access_token TEXT NOT NULL,
      scope TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    )`);
  } catch (e) { /* defensivo */ }
}

/* Firma del state de instalación: id.ts.firma — HMAC-SHA256 con el
 * secreto de sesión (lo pasa server.js; SESSION_SECRET), prefijo
 * 'tninstall:' para que un state de conectar-desde-Ajustes jamás
 * valide como state de instalación ni al revés. */
function signInstallState(id, tsMs, secret) {
  const ts = Number(tsMs).toString(36);
  const sig = crypto.createHmac('sha256', secret || '')
    .update(`tninstall:${id}.${ts}`).digest('hex').slice(0, 32);
  return `${id}.${ts}.${sig}`;
}

/* Guarda el token recién canjeado como instalación pendiente y
 * devuelve el state que viaja a la landing. */
function createPendingInstall(db, data, secret) {
  ensurePendingTable(db);
  cleanupExpiredInstalls(db);
  const d = data || {};
  const id = crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  db.prepare(`INSERT INTO tn_pending_installs (id, store_id, store_name, access_token, scope, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, String(d.store_id || ''), String(d.store_name || ''),
      String(d.access_token || ''), String(d.scope || ''), now);
  return signInstallState(id, now, secret);
}

/* State → fila pendiente, o null si la firma no cierra, venció o la
 * fila ya fue consumida. NO consume: el claim consume al final, así un
 * intento de login fallido no quema la instalación. */
function resolvePendingInstall(db, state, secret) {
  try {
    ensurePendingTable(db);
    const parts = String(state || '').split('.');
    if (parts.length !== 3) return null;
    const [id, tsRaw, sig] = parts;
    if (!/^[a-f0-9]{24}$/.test(id)) return null;
    const ts = parseInt(tsRaw, 36);
    if (!ts || ts > Date.now() + 60 * 1000) return null;
    const expected = crypto.createHmac('sha256', secret || '')
      .update(`tninstall:${id}.${tsRaw}`).digest('hex').slice(0, 32);
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const row = db.prepare('SELECT * FROM tn_pending_installs WHERE id = ?').get(id);
    if (!row) return null;
    // Vencida por el state O por la fila: se limpia en el acto.
    if (Date.now() - ts > INSTALL_TTL_MS || Date.now() - Number(row.created_at) > INSTALL_TTL_MS) {
      try { db.prepare('DELETE FROM tn_pending_installs WHERE id = ?').run(id); } catch (e) {}
      return null;
    }
    return row;
  } catch (e) { return null; }
}

/* Lo que la landing puede mostrar antes del login: solo el nombre de
 * la tienda (nada sensible, ningún token). */
function pendingStoreInfo(db, state, secret) {
  const row = resolvePendingInstall(db, state, secret);
  if (!row) return null;
  return { store_id: row.store_id, store_name: row.store_name || '' };
}

/* Empareja la instalación pendiente con el usuario que acaba de crear
 * cuenta o entrar. Consume la pendiente (un solo uso). Si la tienda
 * estaba conectada a otro usuario, ese vínculo se corta y su bloque
 * TN sale del digest. Devuelve {store_id, store_name} o null. */
function claimPendingInstall(db, state, secret, userId) {
  const row = resolvePendingInstall(db, state, secret);
  if (!row || !userId) return null;
  // Una tienda, un dueño operativo: cortar vínculos anteriores.
  try {
    tiendanube.ensureTable(db);
    const others = db.prepare('SELECT user_id FROM user_connections WHERE provider = ? AND store_id = ? AND user_id != ?')
      .all('tiendanube', row.store_id, userId);
    for (const o of others) {
      try {
        const stored = clientDigest.getStoredDigest(db, o.user_id);
        if (stored && stored.connections && stored.connections.tiendanube) {
          delete stored.connections.tiendanube;
          if (!Object.keys(stored.connections).length) delete stored.connections;
          clientDigest.saveDigest(db, o.user_id, stored);
        }
      } catch (e) { /* el corte de la fila manda */ }
      db.prepare('DELETE FROM user_connections WHERE user_id = ? AND provider = ?').run(o.user_id, 'tiendanube');
    }
  } catch (e) { /* tabla recién creada: sin vínculos previos */ }
  tiendanube.saveConnection(db, userId, {
    store_id: row.store_id, store_name: row.store_name,
    access_token: row.access_token, scope: row.scope,
  });
  try { db.prepare('DELETE FROM tn_pending_installs WHERE id = ?').run(row.id); } catch (e) {}
  return { store_id: row.store_id, store_name: row.store_name || '' };
}

function cleanupExpiredInstalls(db, nowMs) {
  try {
    ensurePendingTable(db);
    const r = db.prepare('DELETE FROM tn_pending_installs WHERE created_at < ?')
      .run((nowMs || Date.now()) - INSTALL_TTL_MS);
    return (r && r.changes) || 0;
  } catch (e) { return 0; }
}

/* Validación del cuerpo del claim (la usa el endpoint de server.js
 * para responder mensajes listos para mostrar, espejo de
 * /api/auth/register). mode: 'register' (default) | 'login'. */
function validateClaimBody(body) {
  const b = body || {};
  const mode = b.mode === 'login' ? 'login' : 'register';
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, mode, email, error: 'Escribí un email válido para tu cuenta 📧' };
  }
  if (!password) return { ok: false, mode, email, error: 'Falta tu contraseña 🔑' };
  if (mode === 'register' && password.length < 6) {
    return { ok: false, mode, email, error: 'La contraseña necesita 6 caracteres como mínimo 🔑' };
  }
  return { ok: true, mode, email, password };
}

module.exports = {
  INSTALL_TTL_MS,
  ensurePendingTable,
  signInstallState,
  createPendingInstall,
  resolvePendingInstall,
  pendingStoreInfo,
  claimPendingInstall,
  cleanupExpiredInstalls,
  validateClaimBody,
};
