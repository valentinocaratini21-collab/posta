'use strict';
// recuerda.js — LOTE PRUEBA-RECUERDA: la serie de recordatorios por email
// de la prueba pendiente de conexión.
//
// EL POZO QUE CIERRA: con PRUEBA-CONECTA (v1213) la semana se arma sin
// cuenta (@ + website) y el reloj de 3 días arranca recién al conectar
// Instagram. Quien se va sin conectar no tenía NINGÚN canal de vuelta:
// el día del posteo 2 y del 3, nadie le decía nada.
//
// LA SERIE (decisión del dueño, 2026-11-20 22:40–22:44):
// · Disparo = la REVELACIÓN del posteo del día (las 9:00 en la zona de
//   la cuenta, la regla de producción vigente: «el posteo del día está
//   listo a las 9:00»). El barrido corre cada 15 min desde scheduler.js
//   y la primera pasada a/desde las 9:00 del día del posteo envía. Sin
//   tope superior dentro del día (espejo de trial-post-ready.js): si la
//   mañana se perdió, el email sigue valiendo — el posteo sigue
//   revelado y «sale hoy a las 19:00» sigue siendo accionable.
// · Audiencia: la prueba PENDIENTE de conexión (users.trial_started_at
//   = 0, la señal de PRUEBA-CONECTA) — invitado (is_guest=1, email el
//   capturado post-valor en trial_cache.email) y cuenta creada sin
//   conectar (is_guest=0, email el de su cuenta). Una sola serie por
//   persona/plan: la audiencia sale de users (una fila por persona) y
//   el dedup es (user_id, post_id).
// · Cada email LLEVA la pieza de ese día (la imagen real del plan y su
//   caption) y la redacción en PRESENTE para la pieza («Este ES tu
//   posteo de hoy»): la pieza existe y es de hoy; el condicional queda
//   solo para la publicación («Todavía no salió… si lo conectás, sale
//   hoy a las 19:00»). Jamás se implica que algo se publicó.
// · El botón es un link FIRMADO (HMAC, la primitiva de approval.js con
//   propósitos propios) que aterriza en SU semana con el paso de
//   conectar abierto: establece la sesión de ESA fila (para el invitado
//   es la misma fila que el registro reclama en el lugar — upgradeGuest
//   — así que crear la cuenta desde ahí queda pre-vinculado a su
//   semana, sin fricción ni token extra).
// · CORTE: conectar el Instagram arranca el reloj (trial_started_at
//   pasa a > 0) y la audiencia deja de incluir a la persona en el acto.
//   La baja de un toque (link firmado en cada email) se honra y queda
//   registrada (recuerda_baja + users.email_opt_out). Termina el plan,
//   termina la serie: el email del último posteo es el último aviso —
//   NO hay email extra de cierre.
// · Sin captura de email (invitado que nunca lo dejó) → cero emails.
//
// CONVIVENCIA CON POST-WOW (v929): trial-post-ready.js mandaba a los
// invitados con email un aviso sin pieza por los posteos de los días 2
// y 3. Desde este lote, ese barrido SALTA a las pruebas nacidas
// pendientes (trial_started_at = 0): las cubre esta serie, con la
// pieza y el botón de conectar. Las invitadas con el reloj ya corriendo
// (generación anterior a PRUEBA-CONECTA) siguen con el aviso de siempre.
//
// Este módulo solo toca la DB que se le pasa y el envío que se le
// inyecta (testeable). En producción el envío es email.js vía Resend;
// sin RESEND_API_KEY, sendEmail omite y registra — el barrido no marca
// como enviado y reintenta en la próxima pasada, como trial-post-ready.

const crypto = require('crypto');

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// TTL de los links: el de aterrizaje vive 4 días (cubre el plan entero
// desde cualquier email de la serie); el de baja, 30 días (la promesa
// «no te escribo más» tiene que poder cumplirse también tarde).
const IR_TTL_HOURS = 96;
const BAJA_TTL_HOURS = 24 * 30;

function ensureSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS recuerda_sent (
      user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, sent_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, post_id))`);
    db.exec(`CREATE TABLE IF NOT EXISTS recuerda_baja (
      user_id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL)`);
  } catch (e) { /* el barrido degrada a no enviar si el esquema no está */ }
}

// --- Firma (la primitiva HMAC de la casa, approval.js; propósitos
// propios 'ir'/'baja' para que un link no sirva para lo otro) ---
function secret() {
  try { return require('./approval').approvalSecret(); } catch (e) { return null; }
}
function hmac(data) {
  const s = secret();
  if (!s) return null;
  return crypto.createHmac('sha256', s).update(String(data)).digest('hex');
}
function signToken(userId, postId, purpose, ttlHours) {
  const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(ttlHours) * 3600);
  const sig = hmac(`recuerda:${purpose}:${userId}:${postId}:${exp}`);
  if (!sig) return null;
  return { u: String(userId), p: String(postId || 0), e: String(exp), s: sig };
}
function tokenQuery(t) {
  return `u=${encodeURIComponent(t.u)}&p=${encodeURIComponent(t.p)}&e=${encodeURIComponent(t.e)}&s=${encodeURIComponent(t.s)}`;
}
function verifyToken(q, purpose) {
  try {
    if (!q) return null;
    const u = parseInt(q.u, 10);
    const p = parseInt(q.p || '0', 10);
    const e = Number(q.e);
    if (!u || !Number.isFinite(e) || e <= Math.floor(Date.now() / 1000)) return null;
    const expected = hmac(`recuerda:${purpose}:${u}:${p}:${e}`);
    if (!expected) return null;
    const a = Buffer.from(String(q.s || ''), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { userId: u, postId: p || 0 };
  } catch (e) { return null; }
}

// --- Baja ---
function isBaja(db, userId) {
  try { return !!db.prepare('SELECT 1 AS x FROM recuerda_baja WHERE user_id = ?').get(userId); }
  catch (e) { return true; } // ante la duda, no escribir: la baja manda
}
function markBaja(db, userId) {
  ensureSchema(db);
  try { db.prepare('INSERT OR IGNORE INTO recuerda_baja (user_id, created_at) VALUES (?, ?)').run(userId, Date.now()); } catch (e) {}
  // «No te escribo más» se honra en toda la casa: el opt-out global de
  // email es el que respetan todos los barridos de scheduler.js.
  try { db.prepare('UPDATE users SET email_opt_out = 1 WHERE id = ?').run(userId); } catch (e) {}
}

// --- Día/hora en la zona de la cuenta (espejo exacto de
// trial-post-ready.js: la misma materialización de la revelación) ---
function dayKeyInTz(date, tz) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-CA', {
      timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch (e) { return ''; }
}
function hourInTz(date, tz) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return -1;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || DEFAULT_TZ, hour: 'numeric', hour12: false,
    }).formatToParts(d);
    const h = parts.find((x) => x.type === 'hour');
    if (!h) return -1;
    return Number(h.value) % 24;
  } catch (e) { return -1; }
}
function userTz(db, userId) {
  try {
    const s = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    return (s && s.timezone) || DEFAULT_TZ;
  } catch (e) { return DEFAULT_TZ; }
}

// El @ canónico de trial_cache (espejo de trial-lock.normalizeIg).
function normalizeIgKey(raw) {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (v.startsWith('instagram.com/')) v = v.slice('instagram.com/'.length);
  v = v.split(/[/?#]/)[0];
  v = v.replace(/^@+/, '').replace(/\s+/g, '').replace(/[^a-z0-9._]/g, '');
  return v.slice(0, 40);
}

// El email de la serie: cuenta → el de su cuenta; invitado → el
// capturado post-valor (trial_cache.email por su @, la misma fuente que
// lee /api/profile). El placeholder @guest.invalid jamás sale.
function resolveEmail(db, u) {
  try {
    if (!u.is_guest) {
      const em = String(u.email || '').trim().toLowerCase();
      return EMAIL_RE.test(em) && !em.endsWith('@guest.invalid') && em.length <= 120 ? em : '';
    }
    const igK = normalizeIgKey(u.guest_ig);
    if (!igK) return '';
    const tc = db.prepare('SELECT email FROM trial_cache WHERE ig = ?').get(igK);
    const em = String((tc && tc.email) || '').trim().toLowerCase();
    return EMAIL_RE.test(em) && em.length <= 120 ? em : '';
  } catch (e) { return ''; }
}

// Negocio y @ para la redacción: perfil primero; si no, el payload de
// la prueba; el @ del invitado es su identidad guardada.
function bizOf(db, u) {
  let name = '', handle = '';
  try {
    const p = db.prepare('SELECT business_name, ig_username FROM profiles WHERE user_id = ?').get(u.id);
    if (p) { name = String(p.business_name || '').trim(); handle = String(p.ig_username || '').trim().replace(/^@/, ''); }
  } catch (e) {}
  if (!handle && u.guest_ig) handle = String(u.guest_ig).trim().replace(/^@/, '');
  if (!name) {
    try {
      const igK = normalizeIgKey(u.guest_ig || handle);
      const tc = igK ? db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(igK) : null;
      if (tc && tc.payload) { const pl = JSON.parse(tc.payload); if (pl && pl.business) name = String(pl.business).trim(); }
    } catch (e) {}
  }
  return { name: name || (handle ? '@' + handle : ''), handle };
}

// El día del alta en SU zona, en su idioma, en minúscula de carta (la
// voz v7 tipea todo en minúscula): «el martes te armaste la semana…».
// Si el alta fue hoy (alta y revelación el mismo día), «hoy».
function armWhen(db, u, tz, lang, todayKey) {
  try {
    const raw = String(u.created_at || '').trim();
    if (!raw) return lang === 'en' ? 'the other day' : 'el otro día';
    const d = new Date(raw.replace(' ', 'T') + (/[zZ]$/.test(raw) ? '' : 'Z'));
    if (isNaN(d)) return lang === 'en' ? 'the other day' : 'el otro día';
    if (dayKeyInTz(d, tz) === todayKey) return lang === 'en' ? 'today' : 'hoy';
    const wd = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es', { weekday: 'long', timeZone: tz || DEFAULT_TZ }).format(d).toLowerCase();
    if (lang === 'en') return 'on ' + wd;
    return 'el ' + wd;
  } catch (e) { return lang === 'en' ? 'the other day' : 'el otro día'; }
}

function imageUrlOf(db, post, userId) {
  try {
    if (!post || !post.image_path) return '';
    const { absoluteMediaUrl } = require('./approval');
    let baseUrl = '';
    try {
      const s = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(userId);
      baseUrl = (s && s.image_base_url) || '';
    } catch (e) {}
    return absoluteMediaUrl(post.image_path, baseUrl) || '';
  } catch (e) { return ''; }
}

async function sendRecuerdaEmails(db, opts = {}) {
  ensureSchema(db);
  const now = (opts && opts.now) || Date.now();
  // Envío por defecto = el real: arma con el template v7 y entrega por
  // email.js (Resend) DESDE Valentino Caratini (FOUNDER_FROM), con
  // reply-to hola@ — la casilla que la operación lee de verdad. El
  // scheduler llama sin opts: este default ES el camino de producción
  // (opts.sendEmail solo lo inyectan los tests).
  const buildSend = (opts && opts.sendEmail) || (async (data) => {
    const emailMod = require('./email');
    const mail = emailMod.trialRecuerdaEmail(data);
    return emailMod.sendEmail({ to: data.to, subject: mail.subject, html: mail.html, text: mail.text, from: emailMod.FOUNDER_FROM, replyTo: 'hola@postycommunitymanager.com' });
  });
  const base = (process.env.BASE_URL || 'https://postycommunitymanager.com').replace(/\/$/, '');
  let users = [];
  try {
    users = db.prepare(`
      SELECT id, email, is_guest, guest_ig, lang, created_at, COALESCE(email_opt_out, 0) AS email_opt_out
      FROM users
      WHERE plan_status = 'trial' AND trial_started_at = 0`).all();
  } catch (e) { console.error('[recuerda] candidatos:', e.message); return { sent: 0, skipped: 0 }; }
  let sent = 0, skipped = 0;
  for (const u of users) {
    try {
      if (u.email_opt_out) { skipped++; continue; }
      if (isBaja(db, u.id)) { skipped++; continue; }
      const to = resolveEmail(db, u);
      if (!to) { skipped++; continue; } // sin captura / sin email válido: cero emails
      const tz = userTz(db, u.id);
      if (hourInTz(now, tz) < 9) { skipped++; continue; } // todavía no se reveló (ventana 9:00)
      const todayKey = dayKeyInTz(now, tz);
      if (!todayKey) { skipped++; continue; }
      let posts = [];
      try {
        posts = db.prepare(`
          SELECT id, image_path, caption, scheduled_at FROM posts
          WHERE user_id = ? AND status = 'scheduled'
          ORDER BY scheduled_at ASC, id ASC`).all(u.id);
      } catch (e) {}
      if (!posts.length) { skipped++; continue; }
      const total = posts.length;
      const { name: bizName, handle } = bizOf(db, u);
      const lang = u.lang === 'en' ? 'en' : 'es';
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        if (dayKeyInTz(p.scheduled_at, tz) !== todayKey) continue; // solo el posteo de hoy (su revelación)
        let already = null;
        try { already = db.prepare('SELECT 1 AS x FROM recuerda_sent WHERE user_id = ? AND post_id = ?').get(u.id, p.id); } catch (e) {}
        if (already) continue;
        const imgUrl = imageUrlOf(db, p, u.id);
        const captionLine = String(p.caption || '').split('\n')[0].trim().slice(0, 140);
        if (!imgUrl && !captionLine) continue; // sin pieza que mostrar, no hay email (regla de verdad)
        const irTok = signToken(u.id, p.id, 'ir', IR_TTL_HOURS);
        const bajaTok = signToken(u.id, p.id, 'baja', BAJA_TTL_HOURS);
        if (!irTok || !bajaTok) { console.error('[recuerda] sin secreto para firmar: se omite'); continue; }
        const data = {
          to,
          lang,
          audience: u.is_guest ? 'guest' : 'account',
          bizName,
          handle,
          armWhen: armWhen(db, u, tz, lang, todayKey),
          n: i + 1,
          total,
          imgUrl,
          captionLine,
          irUrl: `${base}/api/recuerda/ir?${tokenQuery(irTok)}`,
          bajaUrl: `${base}/api/recuerda/baja?${tokenQuery(bajaTok)}`,
        };
        let r = null;
        try { r = await buildSend(data); } catch (e) { console.error('[recuerda] envío falló:', e.message); }
        if (r && r.ok) {
          try { db.prepare('INSERT OR IGNORE INTO recuerda_sent (user_id, post_id, sent_at) VALUES (?, ?, ?)').run(u.id, p.id, now); } catch (e) {}
          sent++;
        } else {
          console.error('[recuerda] no se pudo enviar a', to, '(se reintenta en el próximo barrido)');
        }
        await new Promise((res) => setTimeout(res, 400)); // no saturar el proveedor
      }
    } catch (e) { console.error('[recuerda] usuario', u.id, e.message); }
  }
  if (sent || skipped) console.log(`[recuerda] enviados: ${sent}, omitidos: ${skipped}, candidatos: ${users.length}`);
  return { sent, skipped };
}

module.exports = {
  ensureSchema,
  signToken,
  tokenQuery,
  verifyToken,
  isBaja,
  markBaja,
  resolveEmail,
  normalizeIgKey,
  sendRecuerdaEmails,
  _internal: { dayKeyInTz, hourInTz, armWhen, bizOf },
};
