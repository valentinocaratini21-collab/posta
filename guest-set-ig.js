// guest-set-ig.js — ONBOARDING-SIMPLE (11/11): el @ del invitado, dado en el chat.
//
// El invitado entra al producto SIN @ (guest/start sin identidad) y Posty le
// pide el @ DENTRO del chat («¿cuál es tu Instagram?»). Cuando lo da, este
// módulo resuelve el cambio de identidad sobre la DB — testeable con
// node:sqlite, sin server.js. El handler HTTP (/api/guest/set-ig) orquesta
// generación/importación con estas primitivas.
//
// REGLAS:
// - Solo invitados (is_guest=1). Un @ vacío no es válido (need_ig).
// - Idempotente: mismo @ con posteos ya importados → already, sin regenerar.
// - FIX @ PEGADO (bug del primo, 11/11): si el @ CAMBIA y ya había una
//   semana importada del @ viejo, los posteos de prueba del @ viejo se
//   BORRAN antes de importar los del nuevo. Nunca se sirve la semana del
//   @ viejo con el @ nuevo (eso era el bug: el trial quedaba pegado al
//   primer @ por posta_trial_profile + el caché por @ + el `t.ig || campo`
//   del regenerar de /prueba).
// - Candados espejo de guest/start: trial consumido por una cuenta real
//   (findConsumedUsed) → trial_used; otro invitado ya entró con este @
//   y tiene posteos → guest_used; dispositivo de OTRO usuario → device_used.
// - El candado permanente (findUsed con user_id NULL) NO bloquea acá: es
//   la generación misma, y la generación la frena trialLockGate en
//   /api/trial/generate. La importación desde el caché sigue el mismo
//   criterio que guest/start.
'use strict';

let trialLockMod = null;
try { trialLockMod = require('./trial-lock'); } catch (e) { trialLockMod = null; }

// Normalización del @ (idéntica a trial-lock.normalizeIg).
function normalizeIg(raw) {
  if (trialLockMod && typeof trialLockMod.normalizeIg === 'function') return trialLockMod.normalizeIg(raw);
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (v.startsWith('instagram.com/')) v = v.slice('instagram.com/'.length);
  v = v.split(/[/?#]/)[0];
  v = v.replace(/^@+/, '').replace(/\s+/g, '').replace(/[^a-z0-9._]/g, '');
  return v.slice(0, 40);
}

// ¿Cuántos posteos tiene este usuario? (la semana importada es la prueba
// de que el trial se usó de verdad — mismo criterio que guest/start.)
function countPosts(db, userId) {
  try {
    const r = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(userId);
    return (r && r.n) || 0;
  } catch (e) { return 0; }
}

// Borra los posteos de prueba importados (source='trial') de este usuario
// + sus señales. Es el corazón del fix del @ pegado: sin esto, el cambio
// de @ dejaba la semana vieja puesta y el import (que no corre si ya hay
// posteos) la conservaba. Devuelve cuántos borró.
function clearTrialPosts(db, userId) {
  let n = 0;
  try {
    const rows = db.prepare("SELECT id FROM posts WHERE user_id = ? AND source = 'trial'").all(userId);
    if (!rows.length) return 0;
    const ids = rows.map((r) => r.id);
    try {
      const ph = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM post_signals WHERE post_id IN (${ph})`).run(...ids);
    } catch (e) { /* señales sin tabla: se sigue */ }
    const r = db.prepare("DELETE FROM posts WHERE user_id = ? AND source = 'trial'").run(userId);
    n = (r && r.changes) || rows.length;
  } catch (e) { n = 0; }
  return n;
}

// Aplica el @ a la fila invitada + al perfil (sin tocar business_name ni
// category: esos salen del payload de la semana al importar).
function applyGuestIg(db, userId, igK) {
  try { db.prepare('UPDATE users SET guest_ig = ? WHERE id = ?').run(igK || '', userId); } catch (e) {}
  try {
    db.prepare(`UPDATE profiles SET ig_username = COALESCE(NULLIF(ig_username, ''), ?) WHERE user_id = ?`)
      .run(igK || '', userId);
  } catch (e) {}
}

// ¿Hay una semana cacheada (trial_cache) para este @, con posteos? El
// import la valida de nuevo (motor + negocio); acá solo se decide si vale
// la pena intentar importar o si hay que generar primero.
function trialCacheHasWeek(db, igKey) {
  try {
    if (!igKey) return false;
    const row = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(igKey);
    if (!row || !row.payload) return false;
    const out = JSON.parse(row.payload);
    return !!(out && Array.isArray(out.posts) && out.posts.length);
  } catch (e) { return false; }
}

// Resuelve el cambio de @. MUTA: si el @ cambia y había posteos de prueba,
// los borra; actualiza guest_ig. Devuelve el veredicto; el handler decide
// si importa (cache) o genera primero.
// deps: { trialLock, guestTrial } (los módulos reales; en tests, stubs).
// opts: { userId, ig, device, ip }
function resolveSetIg(db, deps, opts) {
  const o = opts || {};
  const userId = o.userId;
  const igK = normalizeIg(o.ig);
  const trialLock = (deps && deps.trialLock) || trialLockMod;
  const guestTrial = deps && deps.guestTrial;
  if (!userId) return { ok: false, error: 'no_user' };
  if (!igK) return { ok: false, error: 'need_ig' };
  let me = null;
  try { me = db.prepare('SELECT id, is_guest, guest_ig FROM users WHERE id = ?').get(userId); } catch (e) {}
  if (!me || !me.is_guest) return { ok: false, error: 'not_guest' };
  const oldIg = String((me && me.guest_ig) || '');
  const hadPosts = countPosts(db, userId);
  // Mismo @ y semana ya puesta: idempotente, nada que hacer.
  if (oldIg === igK && hadPosts > 0) return { ok: true, already: true, ig: igK, posts: hadPosts };
  // Candados (espejo de guest/start; la allowlist nunca bloquea).
  try {
    if (trialLock && trialLock.findConsumedUsed) {
      const consumed = trialLock.findConsumedUsed(db, igK, '');
      if (consumed) return { ok: false, error: 'trial_used' };
    }
  } catch (e) {}
  try {
    if (guestTrial && guestTrial.findGuestByIdentity) {
      const other = guestTrial.findGuestByIdentity(db, igK, '');
      if (other && Number(other.id) !== Number(userId)) {
        if (countPosts(db, other.id) > 0) return { ok: false, error: 'guest_used' };
      }
    }
  } catch (e) {}
  try {
    if (guestTrial && guestTrial.deviceUsed) {
      const du = guestTrial.deviceUsed(db, o.device || '', o.ip || '');
      if (du && Number(du.user_id) !== Number(userId)) return { ok: false, error: 'device_used' };
    }
  } catch (e) {}
  // FIX @ PEGADO: @ distinto + semana vieja puesta → borrar la semana vieja
  // ANTES de importar la nueva (importTrialWeek no corre si ya hay posteos).
  let cleared = 0;
  const changed = oldIg !== '' && oldIg !== igK;
  if (changed && hadPosts > 0) cleared = clearTrialPosts(db, userId);
  applyGuestIg(db, userId, igK);
  try {
    if (guestTrial && guestTrial.recordDevice) guestTrial.recordDevice(db, o.device || '', o.ip || '', userId);
  } catch (e) {}
  const hasCache = trialCacheHasWeek(db, igK);
  return { ok: true, already: false, changed, cleared, ig: igK, oldIg, hasCache, need_generate: !hasCache };
}

module.exports = {
  normalizeIg,
  countPosts,
  clearTrialPosts,
  applyGuestIg,
  trialCacheHasWeek,
  resolveSetIg,
};
