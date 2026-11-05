// guest-trial.js — PRUEBA-ENTRADA-DIRECTA (4/11): sesión invitada, cuenta al
// primer toque, candado permanente y nudges sin email.
//
// MODELO: el invitado ES una fila de users (is_guest=1) con la misma
// maquinaria que cualquier cuenta (posts, fundamento, chat, niveles,
// scheduler). Por eso "migrar sin reset" es literal: al crear la cuenta se
// actualiza LA MISMA fila (email + password, is_guest=0) y NO se tocan
// created_at ni trial_ends_at — el reloj de 3 días arranca con la sesión
// invitada y se conserva al migrar, por construcción. El único caso en
// que el reloj se corta es el candado de email (ver upgradeGuest).
// Email de la fila invitada: placeholder `guest-<azar>@guest.invalid`
// (dominio .invalid: nunca se entrega nada ahí). Ningún flujo de email
// debe enviar a una fila invitada (lo guardan sendUpcomingEmail y los
// sweeps de nudges); el placeholder jamás se registra en trial_used.
//
// Este módulo solo toca la DB que se le pasa (testeable con node:sqlite).
// No requiere server.js: el handler HTTP vive en server.js y orquesta
// importTrialWeek / seed / schedule con estas primitivas.
'use strict';

const TRIAL_DAYS_GUEST = 3;
const GUEST_EMAIL_DOMAIN = 'guest.invalid';

function ensureSchema(db) {
  try { db.exec(`ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN guest_ig TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN guest_domain TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN guest_device TEXT DEFAULT ''`); } catch (e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS trial_devices (
      device TEXT NOT NULL, ip TEXT NOT NULL, user_id INTEGER,
      created_at INTEGER NOT NULL, PRIMARY KEY (device))`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_trial_devices_ip ON trial_devices (ip)`);
  } catch (e) {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS guest_nudges (
      user_id INTEGER NOT NULL, kind TEXT NOT NULL, sent_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, kind))`);
  } catch (e) {}
  // Backfill del candado permanente desde los locks de 90 días que
  // sobreviven (la higiene borra los de >180 días: esos son los únicos
  // que no se pueden recuperar — ver STATUS). Idempotente.
  try { backfillUsedFromLocks(db); } catch (e) {}
}

// Copia todo trial_locks presente a trial_used (sin tocar los de la
// allowlist: la casa nunca queda "usada"). Se corre en el arranque y en
// cada /api/guest/start, para que una generación anterior a este lote
// también cierre la puerta a una segunda prueba.
function backfillUsedFromLocks(db) {
  try {
    if (!db) return;
    try { db.exec(`CREATE TABLE IF NOT EXISTS trial_used (
      kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER,
      created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))`); } catch (e) {}
    let rows = [];
    try { rows = db.prepare('SELECT ig, domain, generated_at FROM trial_locks').all(); } catch (e) { return; }
    const ins = db.prepare('INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES (?, ?, NULL, ?)');
    for (const r of rows || []) {
      if (r.ig) { try { ins.run('ig', r.ig, r.generated_at || Date.now()); } catch (e) {} }
      if (r.domain) { try { ins.run('domain', r.domain, r.generated_at || Date.now()); } catch (e) {} }
    }
  } catch (e) {}
}

function isGuestEmail(email) {
  return String(email || '').toLowerCase().endsWith('@' + GUEST_EMAIL_DOMAIN);
}

function guestPlaceholderEmail() {
  const rnd = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `guest-${rnd}@${GUEST_EMAIL_DOMAIN}`;
}

// Fin efectivo de la prueba de un invitado: espejo exacto de
// trialEffectiveEnd de server.js (extensión vigente manda; si no, el
// menor entre trial_ends_at y created_at + 3 días).
function guestTrialEnd(u, now) {
  const t = now || Date.now();
  const ext = Number(u.trial_extended_until || 0);
  if (ext > t) return ext;
  const tEnds = Number(u.trial_ends_at || 0);
  if (!tEnds) return 0;
  const cMs = Date.parse(String(u.created_at || '').replace(' ', 'T') + 'Z');
  const policyEnd = cMs ? cMs + TRIAL_DAYS_GUEST * 86400000 : Infinity;
  return Math.min(tEnds, policyEnd);
}

// ¿Este dispositivo o esta IP ya usó su prueba? (1 por dispositivo/IP.
// La allowlist y el modo test se resuelven en el handler, no acá.)
function deviceUsed(db, device, ip) {
  try {
    if (device) {
      const byDevice = db.prepare('SELECT user_id FROM trial_devices WHERE device = ?').get(device);
      if (byDevice) return { by: 'device', user_id: byDevice.user_id };
    }
    if (ip) {
      const byIp = db.prepare('SELECT user_id FROM trial_devices WHERE ip = ? LIMIT 1').get(ip);
      if (byIp) return { by: 'ip', user_id: byIp.user_id };
    }
  } catch (e) {}
  return null;
}

function recordDevice(db, device, ip, userId) {
  try {
    if (!device && !ip) return;
    db.prepare('INSERT OR IGNORE INTO trial_devices (device, ip, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(device || '', ip || '', userId || null, Date.now());
  } catch (e) {}
}

// Crea la fila invitada. NO verifica candados (el handler lo hace antes,
// con allowlist y modo test): esta función solo persiste.
function createGuest(db, { referralCode, lang, ig, domain, device }) {
  const email = guestPlaceholderEmail();
  const trialEnds = Date.now() + TRIAL_DAYS_GUEST * 24 * 3600 * 1000;
  const r = db.prepare(
    `INSERT INTO users (email, password_hash, referral_code, trial_ends_at,
       trust_level, autopilot_enabled, lang, is_guest, guest_ig, guest_domain, guest_device)
     VALUES (?, '', ?, ?, 1, 1, ?, 1, ?, ?, ?)`
  ).run(email, referralCode || '', trialEnds, lang === 'en' ? 'en' : 'es',
    String(ig || ''), String(domain || ''), String(device || ''));
  return { userId: r.lastInsertRowid, email, trialEnds };
}

// Sube la fila invitada a cuenta real, EN LA MISMA FILA.
// - Email ya con cuenta real distinta → { error: 'email_taken' }.
// - Email ya usó una prueba (otro usuario) → la cuenta se crea PERO SIN
//   prueba fresca: trial_ends_at = ahora (consumida) → paywall directo,
//   con feed/posteos/fundamento intactos. { consumed: true }.
// - Caso normal → trial_ends_at y created_at INTACTOS (mismo reloj).
// Devuelve { ok, consumed, trialEnds } o { error }.
function upgradeGuest(db, { userId, email, passwordHash, findUsed }) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return { error: 'email_invalid' };
  if (!passwordHash) return { error: 'password_invalid' };
  const row = db.prepare('SELECT id, is_guest, created_at, trial_ends_at FROM users WHERE id = ?').get(userId);
  if (!row) return { error: 'no_user' };
  if (!row.is_guest) return { error: 'not_guest' };
  const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(em, userId);
  if (taken) return { error: 'email_taken' };
  let consumed = false;
  try {
    if (typeof findUsed === 'function') {
      const hit = findUsed(null, null, em);
      if (hit && Number(hit.user_id) !== Number(userId)) consumed = true;
    }
  } catch (e) {}
  if (consumed) {
    db.prepare(`UPDATE users SET email = ?, password_hash = ?, is_guest = 0 WHERE id = ?`)
      .run(em, passwordHash, userId);
    // Reloj consumido: fin = ahora. created_at NO se toca (el min() con
    // trial_ends_at manda igual); la prueba queda vencida → paywall.
    db.prepare(`UPDATE users SET trial_ends_at = ? WHERE id = ?`).run(Date.now(), userId);
  } else {
    db.prepare(`UPDATE users SET email = ?, password_hash = ?, is_guest = 0 WHERE id = ?`)
      .run(em, passwordHash, userId);
  }
  const after = db.prepare('SELECT created_at, trial_ends_at FROM users WHERE id = ?').get(userId);
  return { ok: true, consumed, trialEnds: after ? after.trial_ends_at : null, createdAt: after ? after.created_at : null };
}

// Mensaje de bienvenida de Posty en el chat del invitado: qué armó, por
// qué, y qué puede tocar (tocar = crear cuenta, sin sorpresas).
function welcomeGuestMessage(db, userId, { lang, business, nPosts }) {
  const en = lang === 'en';
  const biz = String(business || '').trim();
  const text = en
    ? `hi! i'm posty 💙 i just made your first ${nPosts} posts${biz ? ` for ${biz}` : ''} from your real product — they're already in your feed, take a look 👇\n\nif you want to change anything or approve them, tap anything and i'll ask you to create your account first (your feed stays exactly the same).`
    : `hola! soy posty 💙 ya armé tus primeros ${nPosts} posteos${biz ? ` para ${biz}` : ''} con tu producto real — ya están en tu feed, miralos 👇\n\nsi querés cambiar algo o aprobarlos, tocá lo que sea y te pido que crees tu cuenta primero (tu feed queda exactamente igual).`;
  try {
    db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`).run(userId, text);
    return true;
  } catch (e) { return false; }
}

// Nudges de invitados SIN EMAIL (barrido del scheduler, no del email):
// - 24h: invitado con prueba creada hace 24-30h, con posteos, sin nudge.
// - fin: invitado con prueba vencida (reloj efectivo), sin nudge.
// Cada nudge: mensaje de Posty en su chat + push si tiene suscripción
// (pushFn inyectada; sin push, el chat es el canal). Idempotente por
// guest_nudges (una vez por cuenta y tipo, aunque el sweep re-corra).
// Devuelve { n24, nEnd, detalle }.
async function sendGuestTrialNudges(db, { pushFn, now } = {}) {
  const t = now || Date.now();
  const out = { n24: 0, nEnd: 0, detalle: [] };
  let guests = [];
  try {
    guests = db.prepare(`
      SELECT u.id, u.lang, u.created_at, u.trial_ends_at, u.trial_extended_until,
             COALESCE(p.business_name, '') AS biz
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE COALESCE(u.is_guest, 0) = 1 AND COALESCE(u.plan_status, 'trial') = 'trial'
        AND EXISTS (SELECT 1 FROM posts WHERE user_id = u.id)`).all();
  } catch (e) { return out; }
  const hasNudge = (uid, kind) => {
    try { return !!db.prepare('SELECT 1 FROM guest_nudges WHERE user_id = ? AND kind = ?').get(uid, kind); }
    catch (e) { return true; }
  };
  const markNudge = (uid, kind) => {
    try { db.prepare('INSERT OR IGNORE INTO guest_nudges (user_id, kind, sent_at) VALUES (?, ?, ?)').run(uid, kind, t); } catch (e) {}
  };
  const hasPush = (uid) => {
    try { return (db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(uid).n || 0) > 0; }
    catch (e) { return false; }
  };
  const chatInsert = (uid, text) => {
    try { db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`).run(uid, text); return true; }
    catch (e) { return false; }
  };
  for (const g of guests) {
    const en = g.lang === 'en';
    const createdMs = Date.parse(String(g.created_at || '').replace(' ', 'T') + 'Z');
    const ageH = createdMs ? (t - createdMs) / 3600000 : 0;
    const end = guestTrialEnd(g, t);
    // 24h: ventana 24-30h desde la creación (misma que el email de abandono).
    if (!hasNudge(g.id, 'trial_24h') && ageH >= 24 && ageH <= 30) {
      const text = en
        ? `your feed is waiting for you 💙 your posts are ready — come see them and tell me what to change 👇`
        : `tu feed te está esperando 💙 tus posteos ya están listos — vení a verlos y decime qué cambiar 👇`;
      const inChat = chatInsert(g.id, text);
      let pushed = false;
      if (hasPush(g.id) && typeof pushFn === 'function') {
        try {
          const r = await pushFn(g.id, {
            title: en ? 'Your feed is waiting 💙' : 'Tu feed te está esperando 💙',
            body: text, url: '/#/app/inicio',
          });
          pushed = !!(r && r.ok);
        } catch (e) {}
      }
      markNudge(g.id, 'trial_24h');
      out.n24++;
      out.detalle.push({ user_id: g.id, kind: 'trial_24h', chat: inChat, push: pushed });
    }
    // Fin: reloj vencido y sin nudge de cierre.
    if (!hasNudge(g.id, 'trial_end') && end && end <= t) {
      const text = en
        ? `your 3 days are up 😢 your feed and posts are saved — pick your plan and we keep publishing together 💙`
        : `se terminaron tus 3 días 😢 tu feed y tus posteos quedan guardados — elegí tu plan y seguimos publicando juntos 💙`;
      const inChat = chatInsert(g.id, text);
      let pushed = false;
      if (hasPush(g.id) && typeof pushFn === 'function') {
        try {
          const r = await pushFn(g.id, {
            title: en ? 'Your trial ended 💙' : 'Tu prueba terminó 💙',
            body: text, url: '/#/app/ajustes?plan=1',
          });
          pushed = !!(r && r.ok);
        } catch (e) {}
      }
      markNudge(g.id, 'trial_end');
      out.nEnd++;
      out.detalle.push({ user_id: g.id, kind: 'trial_end', chat: inChat, push: pushed });
    }
  }
  return out;
}

module.exports = {
  TRIAL_DAYS_GUEST,
  GUEST_EMAIL_DOMAIN,
  ensureSchema,
  backfillUsedFromLocks,
  isGuestEmail,
  guestPlaceholderEmail,
  guestTrialEnd,
  deviceUsed,
  recordDevice,
  createGuest,
  upgradeGuest,
  welcomeGuestMessage,
  sendGuestTrialNudges,
};
