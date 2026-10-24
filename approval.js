// approval.js — "Posty te avisa": aprobación de posteos por notificación.
// Firmas HMAC para enlaces sin sesión (push/email), ventana de primera semana,
// y dispatcher de avisos (los módulos notify-push/notify-email los provee otro
// worker; si no existen, todo sigue funcionando en silencio).
'use strict';

const crypto = require('crypto');
const path = require('path');

function approvalSecret() {
  const s = process.env.APPROVAL_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error('[approval] falta APPROVAL_SECRET (o SESSION_SECRET): no se pueden firmar enlaces de aprobación');
  return s;
}

// Primitiva HMAC compartida (mismo secreto para posteos y semanas: NO crear
// un tercer esquema; dogfood.js tiene el suyo propio y no se toca).
function hmacHex(data) {
  return crypto.createHmac('sha256', approvalSecret()).update(String(data)).digest('hex');
}

function timingSafeEq(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// Firma una acción sobre un posteo. exp = unix timestamp de vencimiento.
function signAction(postId, action, expHours = 4) {
  const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(expHours) * 3600);
  const sig = hmacHex(`${String(postId)}:${String(action)}:${exp}`);
  return { sig, exp };
}

// Verifica una firma. false si venció, si no coincide o si no hay secreto.
function verifyAction(postId, action, sig, exp) {
  const expN = Number(exp);
  if (!Number.isFinite(expN) || expN <= Math.floor(Date.now() / 1000)) return false;
  let expected;
  try {
    expected = hmacHex(`${String(postId)}:${String(action)}:${expN}`);
  } catch (e) {
    return false; // p.ej. sin secreto configurado
  }
  return timingSafeEq(sig, expected);
}

// FASE 2 — firma una acción sobre una SEMANA ("Publicar semana" de un tap).
// Ata (userId, weekKey, exp) con la misma primitiva HMAC. weekKey =
// 'YYYY-MM-DD' del lunes (mondayKeyOf). TTL recomendado 48-72h: el link de 4h
// del posteo no sirve para aprobar una semana el domingo/lunes.
function signWeekAction(userId, weekKey, expHours = 72) {
  const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(expHours) * 3600);
  const sig = hmacHex(`${String(userId)}:${String(weekKey)}:${exp}`);
  return { sig, exp };
}

function verifyWeekAction(userId, weekKey, sig, exp) {
  const expN = Number(exp);
  if (!Number.isFinite(expN) || expN <= Math.floor(Date.now() / 1000)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekKey || ''))) return false;
  let expected;
  try {
    expected = hmacHex(`${String(userId)}:${String(weekKey)}:${expN}`);
  } catch (e) {
    return false; // p.ej. sin secreto configurado
  }
  return timingSafeEq(sig, expected);
}

// Convierte 'YYYY-MM-DD HH:MM:SS' (UTC, formato SQLite) o ISO a Date.
// new Date('2026-09-30 12:00:00') solo lo tomaría como hora LOCAL: hay que
// marcarlo como UTC explícitamente.
function parseUtc(iso) {
  const s = String(iso || '').trim();
  if (!s) return null;
  if (/[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

// ¿Está el usuario en su primera semana? true si nunca publicó (first_post_at
// vacío) o si pasaron menos de 7 días desde su primera publicación.
function isFirstWeek(db, userId) {
  let first = '';
  try {
    const r = db.prepare('SELECT first_post_at FROM users WHERE id = ?').get(userId);
    first = r && r.first_post_at ? String(r.first_post_at).trim() : '';
  } catch (e) {
    return true; // ante la duda, pedir aprobación (lado seguro)
  }
  if (!first) return true;
  const d = parseUtc(first);
  if (!d) return true;
  return Date.now() < d.getTime() + 7 * 24 * 3600 * 1000;
}

// URL absoluta de una imagen para usar en push/email (donde no hay request).
// Misma lógica que publicImageUrl de scheduler.js.
function absoluteMediaUrl(imagePath, imageBaseUrl) {
  const file = path.basename(String(imagePath || ''));
  let base = imageBaseUrl || process.env.IMAGE_BASE_URL || '';
  // Sin base válida (localhost/dominio viejo), Instagram no puede descargar
  // la imagen: caer al dominio canónico (misma guarda que scheduler.js).
  if (!base || /postahacetodo\.com/i.test(base) || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://postycommunitymanager.com';
  return `${String(base).replace(/\/$/, '')}/media/${file}`;
}

// "18:00": la hora del posteo en el timezone del usuario.
function userHourLabel(db, userId, isoUtc) {
  let tz = 'America/Argentina/Buenos_Aires';
  try {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    if (r && r.timezone) tz = r.timezone;
  } catch (e) { /* default */ }
  try {
    const d = parseUtc(isoUtc);
    if (!d) return '';
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).format(d);
  } catch (e) {
    return '';
  }
}

function getDemoMode(db, userId) {
  try {
    const s = db.prepare('SELECT demo_mode FROM settings WHERE user_id = ?').get(userId);
    return !s || s.demo_mode !== 0;
  } catch (e) {
    return true;
  }
}

// Dispatcher del aviso "tu posteo sale en 3h, ¿lo aprobás?".
// FASE 3 — cascada real push→email: se intenta push primero y SOLO si
// retorna {ok:false} se envía el email (antes se mandaban los dos siempre).
// Retorna el canal usado (channel: 'push' | 'email' | 'none') para tracking.
// Los módulos ./notify-push y ./notify-email los provee el build: si no
// existen (o fallan), no se rompe nada.
async function notifyApproval(db, post) {
  if (getDemoMode(db, post.user_id)) {
    console.log(`[notif] demo: no se envía (post #${post.id})`);
    return { ok: false, demo: true, channel: 'none' };
  }
  let pushRes = null;
  try {
    const m = require('./notify-push');
    if (m && typeof m.sendApprovalPush === 'function') pushRes = await m.sendApprovalPush(db, post);
  } catch (e) { console.error('[notif] push aprobación:', e.message); }
  if (pushRes && pushRes.ok) return { ok: true, channel: 'push', sent: pushRes.sent };
  let emailRes = null;
  try {
    const m = require('./notify-email');
    if (m && typeof m.sendApprovalEmail === 'function') emailRes = await m.sendApprovalEmail(db, post);
  } catch (e) { console.error('[notif] email aprobación:', e.message); }
  if (emailRes && emailRes.ok) return { ok: true, channel: 'email' };
  return { ok: false, channel: 'none' };
}

// Dispatcher del aviso "no se publicó porque no lo aprobaste".
async function notifyMissed(db, post, reason) {
  if (getDemoMode(db, post.user_id)) {
    console.log(`[notif] demo: no se envía (post #${post.id})`);
    return { ok: false, demo: true };
  }
  let pushRes = null, emailRes = null;
  try {
    const m = require('./notify-push');
    if (m && typeof m.sendMissedPush === 'function') pushRes = await m.sendMissedPush(db, post, reason);
  } catch (e) { console.error('[notif] push missed:', e.message); }
  if (pushRes && pushRes.ok) return { ok: true, channel: 'push' };
  try {
    const m = require('./notify-email');
    if (m && typeof m.sendMissedEmail === 'function') emailRes = await m.sendMissedEmail(db, post, reason);
  } catch (e) { console.error('[notif] email missed:', e.message); }
  if (emailRes && emailRes.ok) return { ok: true, channel: 'email' };
  return { ok: false, channel: 'none' };
}

// (v384) Enlaces firmados de LA CARTA (ítem 8): la página /carta/:token
// no lleva sesión; el token ata (kind, ref, exp) con la MISMA primitiva
// HMAC de arriba. kind = 'prueba' (ref = ig normalizado) o 'domingo'
// (ref = id de account_analysis). TTL largo: la carta se reenvía.
function signCartaLink(kind, ref, expHours = 24 * 90) {
  const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(expHours) * 3600);
  const payload = `carta:${String(kind)}:${String(ref)}:${exp}`;
  const sig = hmacHex(payload);
  return Buffer.from(`${kind}.${ref}.${exp}.${sig}`).toString('base64url');
}

function verifyCartaLink(token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length < 4) return null;
    const sig = parts.pop();
    const exp = Number(parts.pop());
    const kind = parts.shift();
    const ref = parts.join('.'); // el ig puede traer puntos
    if (!kind || !ref || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    const expected = hmacHex(`carta:${kind}:${ref}:${exp}`);
    if (!timingSafeEq(sig, expected)) return null;
    return { kind, ref };
  } catch (e) { return null; }
}

// (v398) Enlaces firmados de COMPARTIR MI SEMANA: la página pública
// /semana/:token no lleva sesión; el token ata (userId, gen, exp) con la
// MISMA primitiva HMAC. `gen` es la generación del link guardada en la
// cuenta (users.week_share_gen): regenerar la sube y el link viejo muere
// al instante; apagar (week_share_on=0) también. TTL largo (1 año): es
// un link para la familia/el socio; el control es la revocación, no el
// vencimiento.
function signWeekShareLink(userId, gen, expHours = 24 * 365) {
  const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(expHours) * 3600);
  const payload = `semana:${String(userId)}:${String(gen)}:${exp}`;
  const sig = hmacHex(payload);
  return Buffer.from(`semana.${userId}.${gen}.${exp}.${sig}`).toString('base64url');
}

function verifyWeekShareLink(token) {
  try {
    const raw = Buffer.from(String(token || ''), 'base64url').toString('utf8');
    const parts = raw.split('.');
    if (parts.length !== 5 || parts[0] !== 'semana') return null;
    const userId = Number(parts[1]);
    const gen = Number(parts[2]);
    const exp = Number(parts[3]);
    const sig = parts[4];
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(gen) || gen <= 0) return null;
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    const expected = hmacHex(`semana:${userId}:${gen}:${exp}`);
    if (!timingSafeEq(sig, expected)) return null;
    return { userId, gen };
  } catch (e) { return null; }
}

module.exports = {
  approvalSecret,
  signAction,
  verifyAction,
  signWeekAction,
  verifyWeekAction,
  signCartaLink,
  verifyCartaLink,
  signWeekShareLink,
  verifyWeekShareLink,
  isFirstWeek,
  absoluteMediaUrl,
  userHourLabel,
  notifyApproval,
  notifyMissed,
};
