// trial-lock.js — CANDADO DE PRUEBA (pieza 8, 2026-10-22): un mismo negocio
// no puede volver a generar una prueba hasta pasados 90 días de la anterior.
// El candado nace al GENERAR (cuando la prueba produce los posteos y gasta
// IA), nunca al tipear: un @ abandonado a mitad de camino o inexistente no
// bloquea a nadie.
//
// IDENTIDAD DEL NEGOCIO = su @ de Instagram (handle normalizado) O el
// dominio de su web (dominio normalizado). Si solo se bloqueara el @, la
// regla se salta pegando la URL en el otro campo: misma identidad, mismo
// candado. La vuelta NO es un muro: dentro de los 90 días el visitante
// recibe su prueba existente (snapshot guardado en el propio candado) y el
// camino a pagar/entrar — cero IA nueva, cero frustración para el dueño.
//
// ESTADO DE PRODUCTO anti-abuso: trial_locks queda EXENTA del reseteo por
// época del analytics (como el ledger de costos de IA): la época limpia la
// medición, no las reglas del producto.
//
// LISTA DE EXCEPCIÓN (allowlist): cuentas internas/QA/dogfood nunca se
// bloquean. Fuentes, en orden: built-ins de marca + variable de entorno
// TRIAL_LOCK_ALLOWLIST (coma, con prefijo ig:/domain: o pelado = ig) +
// tabla trial_lock_allowlist (administrable sin deploy).

const LOCK_MS = 90 * 24 * 3600 * 1000; // 90 días exactos
const BUILTIN_ALLOW_IG = ['posty.communitymanager', 'postycommunitymanager'];
const BUILTIN_ALLOW_DOMAIN = ['postyhacetodo.com', 'postycommunitymanager.com'];

// --- Normalización -------------------------------------------------------
// Handle: minúsculas, sin @, sin espacios, extraído de URL si vino pegada
// (instagram.com/handle, con o sin esquema/www, con barra o query al final).
function normalizeIg(raw) {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (v.startsWith('instagram.com/')) v = v.slice('instagram.com/'.length);
  v = v.split(/[/?#]/)[0];
  v = v.replace(/^@+/, '').replace(/\s+/g, '').replace(/[^a-z0-9._]/g, '');
  return v.slice(0, 40);
}

// Dominio: host en minúsculas, sin esquema, sin www, sin path/query/puerto.
function normalizeDomain(raw) {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '').replace(/^\/\//, '');
  v = v.split(/[/?#]/)[0];
  v = v.replace(/:\d+$/, '').replace(/^www\./, '');
  if (!v.includes('.') || /[^a-z0-9.-]/.test(v)) return '';
  return v.slice(0, 120);
}

// --- Allowlist ------------------------------------------------------------
function envAllowlist() {
  const out = { ig: new Set(), domain: new Set() };
  const raw = String(process.env.TRIAL_LOCK_ALLOWLIST || '');
  for (const part of raw.split(',')) {
    const p = part.trim();
    if (!p) continue;
    if (p.startsWith('domain:')) { const d = normalizeDomain(p.slice(7)); if (d) out.domain.add(d); }
    else if (p.startsWith('ig:')) { const h = normalizeIg(p.slice(3)); if (h) out.ig.add(h); }
    else { const h = normalizeIg(p); if (h) out.ig.add(h); }
  }
  return out;
}

function isAllowlisted(db, igKey, domainKey) {
  try {
    if (igKey && BUILTIN_ALLOW_IG.includes(igKey)) return true;
    if (domainKey && BUILTIN_ALLOW_DOMAIN.includes(domainKey)) return true;
    const env = envAllowlist();
    if (igKey && env.ig.has(igKey)) return true;
    if (domainKey && env.domain.has(domainKey)) return true;
    if (db && (igKey || domainKey)) {
      const row = db.prepare(
        `SELECT value FROM trial_lock_allowlist
          WHERE (kind = 'ig' AND value = ?) OR (kind = 'domain' AND value = ?) LIMIT 1`
      ).get(igKey || '', domainKey || '');
      if (row) return true;
    }
  } catch (e) { /* la allowlist nunca rompe la generación */ }
  return false;
}

// --- Consulta / registro ----------------------------------------------------
// Último candado vigente (< 90 días) que matchee por @ O por dominio.
// Devuelve null si no hay candado o si la identidad está exceptuada.
function findLock(db, igKey, domainKey, now = Date.now()) {
  if (!db || (!igKey && !domainKey)) return null;
  if (isAllowlisted(db, igKey, domainKey)) return null;
  const since = now - LOCK_MS;
  const row = db.prepare(
    `SELECT id, ig, domain, business, lang, payload, generated_at
       FROM trial_locks
      WHERE generated_at > ?
        AND ((? <> '' AND ig = ?) OR (? <> '' AND domain = ?))
      ORDER BY generated_at DESC LIMIT 1`
  ).get(since, igKey || '', igKey || '', domainKey || '', domainKey || '');
  if (!row) return null;
  return {
    id: row.id,
    ig: row.ig || '',
    domain: row.domain || '',
    business: row.business || '',
    lang: row.lang || 'es',
    payload: row.payload || null,
    generated_at: row.generated_at,
    unlock_at: row.generated_at + LOCK_MS,
  };
}

// Registra el candado de una generación recién producida. El snapshot
// (payload completo de la prueba) viaja SOLO si entra en el tope — el
// mismo criterio del trial_cache (12 MB): sin snapshot, la vuelta muestra
// el mensaje amable con la fecha exacta en vez de la semana.
function recordLock(db, { ig, domain, business, lang, payloadStr }, now = Date.now()) {
  if (!db || (!ig && !domain)) return false;
  try {
    const payload = payloadStr && payloadStr.length < 12 * 1024 * 1024 ? payloadStr : null;
    db.prepare(
      `INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ig || null, domain || null, String(business || '').slice(0, 80), lang === 'en' ? 'en' : 'es', payload, now, now);
    // Higiene: candados de más de 180 días ya no bloquean ni se muestran;
    // se borran de a poco para que la tabla no crezca sin techo.
    if (Math.random() < 0.05) {
      try { db.prepare('DELETE FROM trial_locks WHERE generated_at < ?').run(now - 180 * 24 * 3600 * 1000); } catch (e) {}
    }
    return true;
  } catch (e) {
    console.error('[posta] trial-lock: no se pudo registrar el candado:', e.message);
    return false;
  }
}

// Decora el payload guardado para servirlo como "tu prueba sigue acá":
// mismas banderas que un hit de caché + las del candado (fechas reales).
function decorateSnapshot(lock, out, helpers) {
  const o = out && typeof out === 'object' ? out : null;
  if (!o) return null;
  o.trial_locked = true;
  o.trial_generated_at = lock.generated_at;
  o.trial_unlock_at = lock.unlock_at;
  o.cached = true;
  if (helpers && typeof helpers.spotsLeft === 'function') {
    try { o.spots_left = helpers.spotsLeft(); } catch (e) {}
  }
  if (helpers && typeof helpers.buildWeek === 'function') {
    try { o.week = helpers.buildWeek((o.posts || []).length, o.lang); } catch (e) {}
  }
  return o;
}

// Mensaje del candado cuando NO hay semana recuperable: amable, con la
// fecha exacta de rehabilitación, jamás acusatorio (tono de marca).
function lockMessage(lock, lang) {
  const d = new Date(lock.unlock_at);
  const fecha = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(d);
  return lang === 'en'
    ? `This business already used its free trial 💛 The next one unlocks on ${fecha}. If it's yours, create your account and Posty keeps building your week every week — no waiting.`
    : `Este negocio ya usó su prueba gratis 💛 La próxima se habilita el ${fecha}. Si es tuyo, creá tu cuenta y Posty sigue armando tu semana cada semana, sin esperar.`;
}

// (v348) purgeLock — remediación admin: borra TODOS los candados que
// matcheen por @ O por dominio (sin importar la edad). Es la única vía
// soportada para que un negocio puntual pueda rehacer su prueba antes
// de los 90 días cuando su fundamento nació mal (caso Gesty): sin esto
// el candado servía la snapshot envenenada sin salida. Devuelve cuántas
// filas se borraron. Solo lo invoca /api/admin/digest/rebuild (token).
function purgeLock(db, igKey, domainKey) {
  if (!db || (!igKey && !domainKey)) return 0;
  try {
    const r = db.prepare(
      `DELETE FROM trial_locks WHERE (? <> '' AND ig = ?) OR (? <> '' AND domain = ?)`
    ).run(igKey || '', igKey || '', domainKey || '', domainKey || '');
    return (r && r.changes) || 0;
  } catch (e) {
    console.error('[posta] trial-lock: purgeLock falló:', e.message);
    return 0;
  }
}

// (LOTE RESET-PRUEBA-NEGOCIO · v918) purgeUsed — remediación admin:
// borra las filas de trial_used de UN negocio (kind 'ig' y/o 'domain'),
// sin tocar las filas 'email' (la cuenta registrada no se resetea) ni
// las de otros negocios. Solo lo invoca /api/admin/trial-reset (token).
// Devuelve cuántas filas se borraron.
function purgeUsed(db, igKey, domainKey) {
  if (!db || (!igKey && !domainKey)) return 0;
  try {
    const r = db.prepare(
      `DELETE FROM trial_used
        WHERE (kind = 'ig' AND ? <> '' AND value = ?)
           OR (kind = 'domain' AND ? <> '' AND value = ?)`
    ).run(igKey || '', igKey || '', domainKey || '', domainKey || '');
    return (r && r.changes) || 0;
  } catch (e) {
    console.error('[posta] trial-lock: purgeUsed falló:', e.message);
    return 0;
  }
}

// (LOTE PRUEBA-ENTRADA-DIRECTA · 4/11) CANDADO PERMANENTE POR @ / DOMINIO /
// EMAIL: la prueba se usa UNA sola vez por @ y UNA sola vez por email,
// PARA SIEMPRE (no solo 90 días). El candado de 90 días (trial_locks)
// sigue vivo para su snapshot dentro de la ventana, pero ya NO habilita
// una prueba nueva al día 91: si la identidad está en trial_used, no hay
// otra prueba. Como trial_locks, trial_used queda EXENTA del reseteo por
// época del analytics: es regla de producto, no medición.
// La allowlist (marca/dogfooding) salta ambos candados y nunca ensucia
// trial_used: las pruebas de la casa no cuentan como uso.
function ensureTrialUsedSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS trial_used (
      kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER,
      created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))`);
  } catch (e) {}
}

// (FIX-ENTRADA-PRUEBA · 5/11) ¿Esta identidad ya CONSUMIÓ su prueba con
// una cuenta real? La generación registra el uso con user_id NULL (ver
// trialLockRecordFor en server.js) y el backfill copia los candados con
// NULL: ese registro dice «se generó», no «se usó». Solo un user_id
// presente (alta real, server.js ~2114/2189/3199/3286) es consumo. La
// entrada de un trial fresco se decide con esto + la fila invitada (ver
// guest-trial.findGuestByIdentity), nunca con findUsed/findLock solos.
function findConsumedUsed(db, igKey, domainKey) {
  try {
    if (!db || (!igKey && !domainKey)) return null;
    if (isAllowlisted(db, igKey || '', domainKey || '')) return null;
    const q = (kind, val) => {
      if (!val) return null;
      try { return db.prepare('SELECT kind, value, user_id, created_at FROM trial_used WHERE kind = ? AND value = ? AND user_id IS NOT NULL').get(kind, val) || null; }
      catch (e) { return null; }
    };
    return q('ig', igKey || '') || q('domain', domainKey || '') || null;
  } catch (e) { return null; }
}

// ¿Esta identidad ya usó su prueba (para siempre)? kind ig/domain/email.
// Devuelve la fila o null. La allowlist nunca está "usada".
function findUsed(db, igKey, domainKey, emailKey) {
  try {
    if (!db) return null;
    if (isAllowlisted(db, igKey || '', domainKey || '')) return null;
    const q = (kind, val) => {
      if (!val) return null;
      try { return db.prepare('SELECT kind, value, user_id, created_at FROM trial_used WHERE kind = ? AND value = ?').get(kind, val) || null; }
      catch (e) { return null; }
    };
    return q('ig', igKey || '') || q('domain', domainKey || '') || q('email', (emailKey || '').trim().toLowerCase()) || null;
  } catch (e) { return null; }
}

// Registra uso permanente (idempotente). Las identidades exceptuadas no
// se registran: la casa puede probar siempre sin gastar su "una vez".
function recordUsed(db, { ig, domain, email, userId }) {
  try {
    if (!db) return;
    if (isAllowlisted(db, ig || '', domain || '')) return;
    const now = Date.now();
    const ins = (kind, val) => {
      if (!val) return;
      try { db.prepare('INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES (?, ?, ?, ?)').run(kind, val, userId || null, now); }
      catch (e) {}
    };
    ins('ig', ig || '');
    ins('domain', domain || '');
    ins('email', (email || '').trim().toLowerCase());
  } catch (e) {}
}

module.exports = {
  LOCK_MS,
  normalizeIg,
  normalizeDomain,
  isAllowlisted,
  findLock,
  recordLock,
  purgeLock,
  purgeUsed,
  decorateSnapshot,
  lockMessage,
  ensureTrialUsedSchema,
  findUsed,
  findConsumedUsed,
  recordUsed,
};
