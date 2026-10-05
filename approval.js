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
  const base = imageBaseUrl || process.env.IMAGE_BASE_URL || 'http://localhost:3000';
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
  try {
    const m = require('./notify-push');
    if (m && typeof m.sendMissedPush === 'function') await m.sendMissedPush(db, post, reason);
  } catch (e) { console.error('[notif] push missed:', e.message); }
  try {
    const m = require('./notify-email');
    if (m && typeof m.sendMissedEmail === 'function') await m.sendMissedEmail(db, post, reason);
  } catch (e) { console.error('[notif] email missed:', e.message); }
  return { ok: true };
}

module.exports = {
  approvalSecret,
  signAction,
  verifyAction,
  signWeekAction,
  verifyWeekAction,
  isFirstWeek,
  absoluteMediaUrl,
  userHourLabel,
  notifyApproval,
  notifyMissed,
};
