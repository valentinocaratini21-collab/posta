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
// (v923 · CHAT-CANTIDAD-REAL · REGLA DE VERDAD — actualizada por
// CORRECTIVO-1, decisión 20:09) nPosts = posteos REALMENTE PROGRAMADOS,
// verificados contra scheduleAllDrafts — NUNCA los importados. La
// prueba arma los 3 posteos desde el arranque (días 1–3 de la prueba,
// visibles en la semana del cliente): no hay goteo — nada «llega»
// después; los 3 ya están. Por eso el mensaje afirma exactamente lo
// programado: con 3 dice que están los 3 en su semana, uno para cada
// día; con menos, solo lo que hay; con 0, no afirma ningún posteo. (La
// importación trae como máximo 3, así que n >= 3 es siempre 3.)
// (LOTE L10 · BIENVENIDA-IDEMPOTENTE · v955) Además: UNA sola
// bienvenida por invitado — ver la guarda antes del INSERT.
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
      ? `hi! i'm posty 💙 your first post is ready${paraBiz} from your real product ✨ and the other two are too: all 3 are already in your week, one for each day of the trial 👇`
      : `hola! soy posty 💙 tu primer posteo está listo${paraBiz} con tu producto real ✨ y los otros dos también: ya están los 3 en tu semana, uno para cada día de la prueba 👇`;
    text += cola;
  } else if (n === 2) {
    text = en
      ? `hi! i'm posty 💙 your first post is ready${paraBiz} from your real product ✨ and the second one too: both are already in your week 👇`
      : `hola! soy posty 💙 tu primer posteo está listo${paraBiz} con tu producto real ✨ y el segundo también: ya están los 2 en tu semana 👇`;
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
  // (LOTE L10 · BIENVENIDA-IDEMPOTENTE · v955) Una sola bienvenida por
  // invitado: guest/start puede tener éxito varias veces para el mismo
  // invitado (re-entrada, multi-pestaña) y cada éxito insertaba otra
  // copia (en vivo: 4 copias + la vieja). Antes de insertar se busca si
  // ya existe una bienvenida de prueba para este invitado. Marcadores
  // (el texto exacto varía por idioma y por nPosts; la pregunta por el
  // @ — «¿cuál es tu Instagram?» — NO es bienvenida de prueba y no casa
  // con ninguno): REAL (n>=1, wording v923 + legacy pre-v923): 'tu
  // primer posteo está listo' / 'your first post is ready' / 'ya armé
  // tus primeros 3 posteos' / 'first 3 posts' (el EN legacy solo consta
  // por el regex negativo de test-lote-chat-cantidad-real.js: el texto
  // viejo EN no sobrevive en el código). PLACEHOLDER (n=0): 'estoy
  // terminando de armar tu semana' / "i'm finishing your week". Regla:
  // una bienvenida REAL previa bloquea cualquier otra (real o
  // placeholder); un placeholder previo solo bloquea otro placeholder —
  // si la primera entrada no tenía nada programado y la segunda sí, el
  // mensaje real ES el aviso prometido («te aviso cuando esté listo») y
  // sí se inserta. Sin soporte de lectura (stub de test sin .get) se
  // sigue como antes: el INSERT corre y la idempotencia la da la DB real.
  // Devuelve false también cuando ya existe (no es error: el llamador
  // ignora el valor).
  const isReal = n >= 1;
  const REAL_MARKERS = ['tu primer posteo está listo', 'your first post is ready', 'ya armé tus primeros 3 posteos', 'first 3 posts'];
  const HOLD_MARKERS = ['estoy terminando de armar tu semana', "i'm finishing your week"];
  const hasMarker = (markers) => {
    const q = markers.map(() => 'text LIKE ?').join(' OR ');
    const row = db.prepare(
      `SELECT 1 AS x FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND (${q}) LIMIT 1`
    ).get(userId, ...markers.map((m) => '%' + m + '%'));
    return !!row;
  };
  try {
    if (hasMarker(REAL_MARKERS)) return false;
    if (!isReal && hasMarker(HOLD_MARKERS)) return false;
  } catch (e) { /* sin .get (stub de test): seguir como antes */ }
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
