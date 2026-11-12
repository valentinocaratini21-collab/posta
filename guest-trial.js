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
  // (LOTE PRUEBA-CUENTA-AL-ENTREGAR · v921) Sin backfill de locks:
  // copiaba cada candado de generación a trial_used y reintroducía el
  // agujero del caso Crumbl (ver nota sobre backfillUsedFromLocks abajo).
}

// (LOTE PRUEBA-CUENTA-AL-ENTREGAR · v921) backfillUsedFromLocks RETIRADO:
// copiaba TODOS los trial_locks a trial_used con user_id NULL — también
// los de generaciones que nunca se entregaron — y findUsed volvía a
// bloquear la re-generación: el mismo agujero del caso Crumbl. Las filas
// trial_used viejas ya copiadas quedan como están (migración v921: no se
// des-gasta nada); los locks nuevos ya no se copian. La única vía para
// que un negocio vuelva a probar es el reseteo admin (v918).

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
      const byIp = db.prepare('SELECT user_id FROM trial_devices WHERE ip = ? ORDER BY created_at DESC LIMIT 1').get(ip);
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

// (FIX-ENTRADA-PRUEBA · 5/11) ¿Esta identidad YA ENTRÓ como invitada?
// La fila users invitada (guest_ig/guest_domain) es la prueba de que el
// trial se consumió por entrada — aunque la cuenta después haya migrado
// a real (el upgrade no borra guest_ig/guest_domain). Sin fila: la
// generación sola no es entrada.
function findGuestByIdentity(db, igKey, domainKey) {
  try {
    if (!db || (!igKey && !domainKey)) return null;
    const row = db.prepare(
      `SELECT id, is_guest FROM users WHERE (? <> '' AND guest_ig = ?) OR (? <> '' AND guest_domain = ?) ORDER BY id DESC LIMIT 1`
    ).get(igKey || '', igKey || '', domainKey || '', domainKey || '');
    return row || null;
  } catch (e) { return null; }
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
  // (ONBOARDING-SIMPLE · 11/11) Sin contraseña, nunca: passwordHash es
  // opcional; sin él, la fila conserva su hash ('' en invitados) y la
  // entrada es solo por magic link.
  const row = db.prepare('SELECT id, is_guest, created_at, trial_ends_at, password_hash FROM users WHERE id = ?').get(userId);
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
  const keepHash = passwordHash || row.password_hash || '';
  if (consumed) {
    db.prepare(`UPDATE users SET email = ?, password_hash = ?, is_guest = 0 WHERE id = ?`)
      .run(em, keepHash, userId);
    // Reloj consumido: fin = ahora. created_at NO se toca (el min() con
    // trial_ends_at manda igual); la prueba queda vencida → paywall.
    db.prepare(`UPDATE users SET trial_ends_at = ? WHERE id = ?`).run(Date.now(), userId);
  } else {
    db.prepare(`UPDATE users SET email = ?, password_hash = ?, is_guest = 0 WHERE id = ?`)
      .run(em, keepHash, userId);
  }
  const after = db.prepare('SELECT created_at, trial_ends_at FROM users WHERE id = ?').get(userId);
  return { ok: true, consumed, trialEnds: after ? after.trial_ends_at : null, createdAt: after ? after.created_at : null };
}

// Mensaje de bienvenida de Posty en el chat del invitado: qué armó, por
// qué, y qué puede tocar (tocar = crear cuenta, sin sorpresas).
// (v923 · CHAT-CANTIDAD-REAL · REGLA DE VERDAD) nPosts = posteos
// REALMENTE PROGRAMADOS, verificados contra scheduleAllDrafts — NUNCA
// los importados. La prueba entrega 1 posteo por día (la semana dice
// «salen uno por uno, día por día»): el día 1 solo el primero está
// listo; los otros llegan uno por día. Por eso el mensaje NUNCA afirma
// una cantidad que no se verificó: con 3 programados dice «tu primer
// posteo está listo; los otros dos llegan uno por día»; con menos,
// solo lo que hay; con 0, no afirma ningún posteo. (La importación
// trae como máximo 3, así que n >= 3 es siempre exactamente 3.)
function welcomeGuestMessage(db, userId, { lang, business, nPosts }) {
  const en = lang === 'en';
  const biz = String(business || '').trim();
  const paraBiz = biz ? (en ? ` for ${biz}` : ` para ${biz}`) : '';
  const n = Number(nPosts) || 0;
  const cola = en
    ? `\n\nif you want to change anything or approve it, tap anything and i'll ask you to create your account first (your feed stays exactly the same).`
    : `\n\nsi querés cambiar algo o aprobarlo, tocá lo que sea y te pido que crees tu cuenta primero (tu feed queda exactamente igual).`;
  let text;
  if (n >= 3) {
    text = en
      ? `hi! i'm posty 💙 your first post is ready${paraBiz} from your real product ✨ the other two arrive one per day 👇`
      : `hola! soy posty 💙 tu primer posteo está listo${paraBiz} con tu producto real ✨ los otros dos llegan uno por día 👇`;
    text += cola;
  } else if (n === 2) {
    text = en
      ? `hi! i'm posty 💙 your first post is ready${paraBiz} from your real product ✨ the other one arrives tomorrow 👇`
      : `hola! soy posty 💙 tu primer posteo está listo${paraBiz} con tu producto real ✨ el otro llega mañana 👇`;
    text += cola;
  } else if (n === 1) {
    text = en
      ? `hi! i'm posty 💙 your first post is ready${paraBiz} from your real product ✨ take a look 👇`
      : `hola! soy posty 💙 tu primer posteo está listo${paraBiz} con tu producto real ✨ miralo 👇`;
    text += cola;
  } else {
    text = en
      ? `hi! i'm posty 💙 i'm finishing your week${paraBiz} ✨ i'll let you know when your first post is ready`
      : `hola! soy posty 💙 estoy terminando de armar tu semana${paraBiz} ✨ te aviso cuando tu primer posteo esté listo`;
  }
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
  findGuestByIdentity,
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
