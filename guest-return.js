// guest-return.js — LOTE RETORNO DEL INVITADO: la puerta «Volver a mi
// semana / Back to my week» del que entró a la prueba sin contraseña.
//
// MODELO: el invitado de la prueba es una fila de users (is_guest=1) cuya
// única credencial es la sesión del navegador que la creó. Si vuelve de
// otro teléfono o sin esa sesión, no tiene vuelta: la puerta de /prueba
// le pide una contraseña que nunca creó. Esta puerta le manda un link de
// UN SOLO USO (24 h, re-pedible por la misma puerta) y al tocarlo la
// sesión se abre sobre SU fila invitada: aterriza en su semana, nunca en
// el login pelado.
//
// CANALES Y GUARDA DE IDENTIDAD (decisión de Valentino, 16/11 — las tres
// opciones juntas, con el cuidado): el link que ABRE la semana viaja
// solo por canales que prueban que el receptor es el dueño — el DM de
// Instagram a su cuenta y el email público del negocio si existe. El
// email que el visitante ESCRIBE en la puerta no prueba identidad
// (cualquiera puede escribir el @ ajeno y su propio email): recibe el
// AVISO de que el link salió por los canales seguros, y queda guardado
// como email de contacto de la prueba solo cuando se confirma desde un
// canal que prueba (el toque del link emitido). La contraseña, si un día
// la quiere, la crea adentro de su semana: nunca es requisito para
// volver.
//
// LA RUTA DEL DM (verificada en código, ver AVISO-RETORNO): el servidor
// NO puede abrir una conversación fría por la API de Instagram — su
// único camino de envío (insights.sendDM) responde dentro de
// conversaciones existentes y exige el IGSID del destinatario, que solo
// nace de una conversación previa; no hay resolución @→IGSID en el
// servidor y la ventana de mensajería de Meta exige interacción previa.
// Por eso el DM de esta puerta lo trabaja la LÍNEA A MANO: el handler
// abre el caso `prueba_retorno_dm` con el link y el @, visible en el
// Conserje desde el acto (pendingConcierge), y el envío se hace desde la
// app de Instagram de la cuenta de la casa (el primer mensaje a una
// cuenta pública/comercial llega a sus solicitudes). Si el negocio ya
// conversó con la casa (hay IGSID en dm_queue), el handler intenta
// además el envío por API con ese IGSID.
//
// Este módulo solo toca la DB que se le pasa (testeable con
// node:sqlite), espejo de guest-trial.js / magic_tokens: en la tabla se
// guarda solo el HASH del token.
'use strict';

const crypto = require('crypto');

const RETURN_TTL_MS = 24 * 3600 * 1000;
// Espejo del magic-request: máx 5 pedidos por hora por @ (y el handler
// suma el mismo tope por IP).
const RATE_MAX = 5;
const RATE_WINDOW_MS = 3600 * 1000;

function ensureSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS guest_return_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      ig TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT 'es',
      typed_email TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_guest_return_tokens_ig ON guest_return_tokens(ig, created_at)`);
  } catch (e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS guest_return_contacts (
      ig TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      confirmed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`);
  } catch (e) {}
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

// Emite un token para el invitado. Devuelve el token crudo (lo único que
// viaja en el link) y su vencimiento.
function issueToken(db, { userId, ig, lang, typedEmail, now } = {}) {
  ensureSchema(db);
  const t = now || Date.now();
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = t + RETURN_TTL_MS;
  db.prepare(`INSERT INTO guest_return_tokens
    (token_hash, user_id, ig, lang, typed_email, created_at, expires_at, used)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
    .run(hashToken(raw), Number(userId) || 0, String(ig || ''), lang === 'en' ? 'en' : 'es',
      String(typedEmail || '').trim().toLowerCase(), t, expiresAt);
  return { token: raw, expiresAt };
}

// ¿Cuántos tokens se emitieron para este @ en la ventana? (rate limit).
function recentCount(db, ig, now) {
  ensureSchema(db);
  const t = now || Date.now();
  try {
    const r = db.prepare('SELECT COUNT(*) AS c FROM guest_return_tokens WHERE ig = ? AND created_at >= ?')
      .get(String(ig || ''), t - RATE_WINDOW_MS);
    return (r && r.c) || 0;
  } catch (e) { return 0; }
}

// Consume el token: un solo uso y dentro de sus 24 h. La marca de uso es
// atómica (UPDATE ... WHERE used = 0): dos toques simultáneos no abren
// dos sesiones. Devuelve la fila o null (inválido / usado / vencido).
function consumeToken(db, raw, now) {
  ensureSchema(db);
  const t = now || Date.now();
  const h = hashToken(raw);
  let row = null;
  try { row = db.prepare('SELECT * FROM guest_return_tokens WHERE token_hash = ?').get(h); } catch (e) {}
  if (!row || row.used || !(Number(row.expires_at) > t)) return null;
  let changed = 0;
  try {
    const r = db.prepare('UPDATE guest_return_tokens SET used = 1 WHERE token_hash = ? AND used = 0').run(h);
    changed = Number(r.changes || 0);
  } catch (e) {}
  if (!changed) return null;
  return row;
}

// El email público cosechado del negocio: vive en trial_cache.email de
// su clave de caché (por @, o por 'web:<dominio>' si entró solo con
// web). El placeholder del invitado (@guest.invalid) NUNCA es un canal.
function harvestedEmailFor(db, igKey, domainKey) {
  const keys = [];
  if (igKey) keys.push(String(igKey));
  if (domainKey) keys.push('web:' + String(domainKey));
  for (const k of keys) {
    try {
      const row = db.prepare('SELECT email FROM trial_cache WHERE ig = ?').get(k);
      const em = String((row && row.email) || '').trim().toLowerCase();
      if (em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) && !em.endsWith('@guest.invalid')) return em;
    } catch (e) {}
  }
  return '';
}

// Guarda el email escrito en la puerta como contacto SIN confirmar. No
// pisa un contacto ya confirmado: lo confirmado solo lo reemplaza otra
// confirmación.
function saveTypedEmail(db, ig, email, now) {
  ensureSchema(db);
  const em = String(email || '').trim().toLowerCase();
  if (!ig || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return false;
  try {
    db.prepare(`INSERT INTO guest_return_contacts (ig, email, confirmed, updated_at) VALUES (?, ?, 0, ?)
      ON CONFLICT(ig) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at
      WHERE guest_return_contacts.confirmed = 0`)
      .run(String(ig), em, now || Date.now());
    return true;
  } catch (e) { return false; }
}

// Confirma el email escrito cuando el link emitido CON ese email se
// consume: el toque llegó desde un canal que prueba (DM o email
// público), así que el email escrito queda como el de contacto de la
// cuenta. Sin fila o con otro email, no confirma nada.
function confirmTypedEmail(db, ig, email, now) {
  ensureSchema(db);
  const em = String(email || '').trim().toLowerCase();
  if (!ig || !em) return false;
  try {
    const r = db.prepare(`UPDATE guest_return_contacts SET confirmed = 1, updated_at = ?
      WHERE ig = ? AND email = ?`).run(now || Date.now(), String(ig), em);
    return Number(r.changes || 0) > 0;
  } catch (e) { return false; }
}

function contactFor(db, ig) {
  ensureSchema(db);
  try {
    return db.prepare('SELECT ig, email, confirmed FROM guest_return_contacts WHERE ig = ?').get(String(ig || '')) || null;
  } catch (e) { return null; }
}

// El texto del DM (espejo del mock aprobado): corto, con el link y la
// salida para pedir otro. Lo manda la línea a mano desde la app de
// Instagram, o la API cuando ya hay conversación.
function dmMessage(lang, link) {
  return lang === 'en'
    ? `Hi! 👋 Here's your week — one tap and you're in:\n${link}\nIt expires in 24 h. Need a new one? Just ask me here 💛`
    : `¡Hola! 👋 Acá está tu semana — un toque y entrás:\n${link}\nVence en 24 h. ¿Necesitás otro? Pedímelo por acá 💛`;
}

module.exports = {
  RETURN_TTL_MS,
  RATE_MAX,
  RATE_WINDOW_MS,
  ensureSchema,
  hashToken,
  issueToken,
  recentCount,
  consumeToken,
  harvestedEmailFor,
  saveTypedEmail,
  confirmTypedEmail,
  contactFor,
  dmMessage,
};
