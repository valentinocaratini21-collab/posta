'use strict';
// trial-day-push.js — PUSH «tu posteo de hoy ya está listo» para el
// invitado de la prueba (LOTE PRUEBA-AVISO-DÍA-2-Y-3 · pedido de
// Valentino 13/11 21:06: «Es muy importante avisarles de la manera
// correcta y en el momento correcto»).
//
// El hueco: el invitado (sin cuenta, sin IG conectado) recibía el
// primer posteo y ningún canal le contaba que los días 2 y 3 llegan
// dos posteos más. El email gemelo existe desde v929
// (trial-post-ready.js) pero solo llega a quien dejó su email. La
// push matutina (morning-post-push.js) es de cuentas que PUBLICAN
// («sale a las 19:00», abre el ritual): no es el aviso de la prueba.
//
// Este barrido es el canal push de ESE aviso, con las mismas reglas
// duras del email (espejo de trial-post-ready.js):
// · Solo invitados vigentes (is_guest=1, trial vivo) CON suscripción
//   push: la suscripción ES el permiso (la pidieron con el motivo en
//   la tarjeta del día 1 de Inicio: «¿Te aviso cuando esté el de
//   mañana?»). Sin suscripción, silencio: no hay aviso push.
// · Ventana: desde las 9:00 en la zona del invitado (settings.timezone,
//   default America/Argentina/Buenos_Aires), sin tope dentro del día:
//   si el barrido se perdió la mañana, el aviso sigue valiendo (el
//   posteo sigue en su semana). El barrido corre cada 15 min desde
//   scheduler.js: la primera pasada tras las 9:00 envía.
// · Solo el posteo de HOY (status='scheduled', día == hoy en su zona)
//   y nunca el del día 1 (el del wow, ya visto): solo posteos con
//   fecha posterior al día en que se generó la prueba
//   (trial_cache.created_at, la misma fuente que el email).
// · Un día sin posteo listo NO avisa y no declara nada: la cadena de
//   la semana sigue su curso (si el posteo se crea más tarde ese día,
//   una pasada posterior dentro de la ventana lo avisa).
// · Dedup durable: tabla trial_day_push_sent (user_id, post_id) —
//   un envío por posteo. Se marca SOLO cuando el envío tuvo éxito
//   (r.ok || r.sent > 0, el criterio de morning-post-push); si la
//   push falla o no hay clave, el próximo barrido reintenta.
// · Copia de comprobante, no conversación: el posteo YA está en su
//   semana; el aviso lo trae a verlo (url '/#/app/inicio'). NUNCA
//   «sale» ni «se publica»: en la prueba nada se postea de verdad.
// · Idioma: el de su prueba (trial_cache.payload.lang === 'en' → EN;
//   fallback users.lang).

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

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

function trialDayText(lang) {
  if (lang === 'en') {
    return {
      title: 'Your post for today is ready 👀',
      body: 'Today\u2019s post from your trial is already in your week \u2014 take a look.',
    };
  }
  return {
    title: 'Tu posteo de hoy está listo 👀',
    body: 'El posteo de hoy de tu prueba ya está en tu semana \u2014 miralo.',
  };
}

function ensureTrialDayPushTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS trial_day_push_sent (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    sent_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, post_id)
  )`);
}

async function sendTrialDayPushes(db, opts = {}) {
  const pushFn = (opts && opts.pushFn) || ((uid, payload) => require('./push').sendPush(uid, payload));
  const now = (opts && opts.now) || Date.now();
  const res = { checked: 0, sent: 0, skipped: 0, errors: [] };
  if (!db) { res.errors.push('no_db'); return res; }
  try { ensureTrialDayPushTable(db); } catch (e) { res.errors.push('table:' + e.message); return res; }
  let userIds = [];
  try {
    userIds = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all().map((r) => r.user_id);
  } catch (e) { res.errors.push('subs:' + e.message); return res; }
  for (const uid of userIds) {
    try {
      res.checked++;
      let u = null;
      try { u = db.prepare('SELECT is_guest, trial_ends_at, guest_ig, lang FROM users WHERE id = ?').get(uid); } catch (e) {}
      if (!u || u.is_guest !== 1) { res.skipped++; continue; } // solo invitados: el registrado tiene su push matutina
      if (u.trial_ends_at && Number(u.trial_ends_at) <= now) { res.skipped++; continue; } // prueba vencida: silencio
      const tz = guestTz(db, uid);
      if (hourInTz(now, tz) < 9) { res.skipped++; continue; } // todavía no es la mañana de ese día
      const todayKey = dayKeyInTz(now, tz);
      if (!todayKey) { res.skipped++; continue; }
      // Día de creación de SU prueba + idioma, de trial_cache (la
      // misma fuente que el email de v929).
      let createdKey = '', pLang = '';
      try {
        const igK = String(u.guest_ig || '').trim().toLowerCase();
        if (igK) {
          const tc = db.prepare('SELECT created_at, payload FROM trial_cache WHERE ig = ?').get(igK);
          if (tc) {
            createdKey = dayKeyInTz(Number(tc.created_at) || 0, tz);
            try { const pl = JSON.parse(tc.payload || '{}'); if (pl.lang === 'en') pLang = 'en'; } catch (e) {}
          }
        }
      } catch (e) {}
      if (!pLang && u.lang === 'en') pLang = 'en';
      let posts = [];
      try { posts = db.prepare(`SELECT id, scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL`).all(uid); } catch (e) { res.errors.push('posts:' + uid + ':' + e.message); continue; }
      const t = trialDayText(pLang);
      for (const p of posts) {
        const dayKey = dayKeyInTz(p.scheduled_at, tz);
        if (!dayKey || dayKey !== todayKey) continue; // solo el posteo de hoy
        if (createdKey && dayKey <= createdKey) continue; // nunca el posteo del día 1 (el del wow)
        let already = null;
        try { already = db.prepare('SELECT 1 AS x FROM trial_day_push_sent WHERE user_id = ? AND post_id = ?').get(uid, p.id); } catch (e) {}
        if (already) continue;
        let r = null;
        try { r = await pushFn(uid, { title: t.title, body: t.body, url: '/#/app/inicio', data: { postId: String(p.id), trialDay: '1' } }); }
        catch (e) { r = { ok: false, reason: 'throw:' + e.message }; }
        if (r && (r.ok || Number(r.sent) > 0)) {
          try { db.prepare('INSERT OR IGNORE INTO trial_day_push_sent (user_id, post_id, sent_at) VALUES (?,?,?)').run(uid, p.id, now); } catch (e) {}
          res.sent++;
        } else {
          res.skipped++;
        }
      }
    } catch (e) { res.errors.push('user:' + uid + ':' + e.message); }
  }
  if (res.sent || res.errors.length) console.log(`[trial-day-push] enviados: ${res.sent}, omitidos: ${res.skipped}, revisados: ${res.checked}`);
  return res;
}

module.exports = { sendTrialDayPushes, ensureTrialDayPushTable, trialDayText, dayKeyInTz, hourInTz };
