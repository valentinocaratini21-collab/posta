'use strict';
// trial-post-ready.js — Email «tu posteo de mañana está listo»
// (LOTE POST-WOW v929 · veredicto Valentino 11/11).
//
// Al invitado que dejó su email en la prueba, cuando el posteo del día
// siguiente se revela (9:00 en su zona). Lo trae de vuelta a VERLO.
// NUNCA «a punto de postear»: en la prueba nada se postea de verdad.
//
// Reglas duras (espejo de morning-post-push.js):
// · Ventana: desde las 9:00 en la zona de la cuenta (settings.timezone,
//   default America/Argentina/Buenos_Aires). El barrido corre cada 15 min
//   desde scheduler.js, así que la primera pasada tras las 9:00 envía.
//   Sin tope superior dentro del día: si el barrido se perdió la mañana,
//   el email sigue valiendo (el posteo sigue revelado y visible).
// · Solo posteos status='scheduled' con día == hoy en la zona de la cuenta.
// · Nunca el posteo del día 1 (el del wow, ya visto): solo posteos con
//   fecha posterior al día en que se generó la prueba.
// · Solo invitados vigentes (is_guest=1, trial vivo, con posteos). Si se
//   registró, ya no es invitado: silencio.
// · Dedup durable: tabla trial_post_ready_sent (ig, post_id) — un envío por
//   posteo. Se marca SOLO cuando el envío tuvo éxito (r.ok); si Resend
//   falla o no hay clave, el próximo barrido reintenta.
// · Idioma: el de su prueba (trial_cache.payload.lang === 'en' → EN).
// · El link retoma la sesión invitada (/api/guest/resume?ig=).

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

function guestTz(db, userId) {
  try {
    const s = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    return (s && s.timezone) || DEFAULT_TZ;
  } catch (e) { return DEFAULT_TZ; }
}

async function sendTrialPostReadyEmails(db, opts = {}) {
  const sendFn = (opts && opts.sendEmail) || ((...a) => require('./email').trialPostReadyEmail(...a));
  const findGuest = (opts && opts.findGuestByIdentity) || ((igK) => { try { return require('./guest-trial').findGuestByIdentity(db, igK, ''); } catch (e) { return null; } });
  const now = (opts && opts.now) || Date.now();
  const base = (process.env.BASE_URL || 'https://postycommunitymanager.com').replace(/\/$/, '');
  let leads = [];
  try {
    leads = db.prepare(`SELECT ig, email, payload, created_at FROM trial_cache WHERE email IS NOT NULL AND email != ''`).all();
  } catch (e) { console.error('[post-ready] candidatos:', e.message); return { sent: 0, skipped: 0 }; }
  let sent = 0, skipped = 0;
  for (const l of leads) {
    try {
      const igK = String(l.ig || '').trim().toLowerCase();
      const email = String(l.email || '').trim().toLowerCase();
      if (!igK || !LEAD_EMAIL_RE.test(email) || email.length > 120) { skipped++; continue; }
      const g = findGuest(igK);
      if (!g) { skipped++; continue; }
      let u = null;
      try { u = db.prepare('SELECT is_guest, trial_ends_at FROM users WHERE id = ?').get(g.id); } catch (e) {}
      if (!u || u.is_guest !== 1) { skipped++; continue; }
      if (u.trial_ends_at && Number(u.trial_ends_at) <= now) { skipped++; continue; }
      const tz = guestTz(db, g.id);
      if (hourInTz(now, tz) < 9) { skipped++; continue; } // todavía no se reveló (ventana 9:00)
      const todayKey = dayKeyInTz(now, tz);
      const createdKey = dayKeyInTz(Number(l.created_at) || 0, tz);
      if (!todayKey) { skipped++; continue; }
      let posts = [];
      try { posts = db.prepare(`SELECT id, scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled'`).all(g.id); } catch (e) {}
      let biz = '', pLang = '';
      try { const pl = JSON.parse(l.payload || '{}'); biz = String(pl.business || '').trim(); if (pl.lang === 'en') pLang = 'en'; } catch (e) {}
      for (const p of posts) {
        const dayKey = dayKeyInTz(p.scheduled_at, tz);
        if (!dayKey || dayKey !== todayKey) continue; // solo el posteo de hoy
        if (createdKey && dayKey <= createdKey) continue; // nunca el posteo del día 1 (el del wow)
        let already = null;
        try { already = db.prepare('SELECT 1 AS x FROM trial_post_ready_sent WHERE ig = ? AND post_id = ?').get(igK, p.id); } catch (e) {}
        if (already) continue;
        const link = `${base}/api/guest/resume?ig=${encodeURIComponent(igK)}`;
        let r = null;
        try { r = await sendFn({ email }, base, biz, link, pLang); } catch (e) { console.error('[post-ready] envío falló:', e.message); }
        if (r && r.ok) {
          try { db.prepare('INSERT OR IGNORE INTO trial_post_ready_sent (ig, post_id, sent_at) VALUES (?,?,?)').run(igK, p.id, now); } catch (e) {}
          sent++;
        } else {
          console.error('[post-ready] no se pudo enviar a', email, '(se reintenta en el próximo barrido)');
        }
      }
    } catch (e) { console.error('[post-ready] lead', l.ig, e.message); }
    await new Promise((r) => setTimeout(r, 400)); // no saturar el proveedor
  }
  if (sent || skipped || leads.length) console.log(`[post-ready] enviados: ${sent}, omitidos: ${skipped}, leads: ${leads.length}`);
  return { sent, skipped };
}

module.exports = { sendTrialPostReadyEmails, dayKeyInTz, hourInTz };
