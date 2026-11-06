'use strict';
// morning-post-push.js — PUSH MATUTINA «Tu posteo de hoy ya está»
// (LOTE POSTEO-DEL-DIA, corrección Valentino 2/11 ~20:57; ventana
// movida a las 9:00 por decisión Valentino 2/11 ~21:09.)
//
// Cada mañana, en la ZONA DE LA CUENTA, al usuario con posteo programado
// para hoy le llega un mensajito push que al tocarlo abre la app en
// el ritual (#/app/ritual, lote 5/8), donde vive el paquete del día.
//
// Reglas duras (fail-closed, nunca push sin posteo real):
// · Ventana: la hora 9:00 en la zona de la cuenta (settings.timezone,
//   default America/Argentina/Buenos_Aires). El barrido corre cada
//   15 min desde scheduler.js, así que la primera pasada tras las 9:00
//   envía (llega 9:00–9:15 local); un reinicio dentro de la ventana
//   no pierde el día.
// · Solo usuarios con suscripción push efectiva: sendPush devuelve
//   no_subs / no_vapid / apns_no_configurado y NO se marca nada; el
//   próximo barrido dentro de la ventana reintenta.
// · Solo posteos status='scheduled' con día == hoy en la zona de la
//   cuenta, el más temprano si hubiera más de uno. Sin posteo hoy:
//   silencio total, sin marca, sin push. Un posteo ya publicado no
//   dispara (ya no está pendiente).
// · Dedup durable: tabla morning_post_push (user_id, day_key) — un
//   envío por usuario por día. Se marca SOLO cuando el envío tuvo
//   sent > 0.
// · No se anuncia a cuentas con publishing_stopped = 1 (no van a
//   publicar: anunciar sería mentir).
// · Idioma: users.lang (en → EN, resto ES). URL '/#/app/ritual': el
//   ritual vive ahí desde el lote 5/8 (antes '/#/app/inicio': el hero
//   vivía en Inicio; ahora la push abre el paquete del día y el posteo
//   del día se elige ahí). El tap nativo rutea por url (push.js la
//   incluye en el payload APNs y web).
// · Esto NO reemplaza el aviso de 30 min ni la carta: es solo el
//   anuncio matutino del hero. No publica nada, no aprueba nada, no
//   reprograma nada.

const MORNING_START_HOUR = 9;
const MORNING_END_HOUR = 10;
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

function inMorningWindow(date, tz) {
  const h = hourInTz(date, tz);
  return h >= MORNING_START_HOUR && h < MORNING_END_HOUR;
}

function pickTodayPost(posts, tz, now) {
  try {
    const hoy = dayKeyInTz(now, tz);
    if (!hoy) return null;
    const cands = (Array.isArray(posts) ? posts : []).filter((p) => {
      if (!p || p.status !== 'scheduled' || !p.scheduled_at) return false;
      const d = new Date(String(p.scheduled_at).replace(' ', 'T'));
      if (isNaN(d)) return false;
      return dayKeyInTz(d, tz) === hoy;
    });
    if (!cands.length) return null;
    cands.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    return cands[0];
  } catch (e) { return null; }
}

function morningText(lang) {
  if (lang === 'en') return { title: 'Posty', body: 'Your post for today is ready 👇' };
  return { title: 'Posty', body: 'Tu posteo de hoy ya está 👇' };
}

function ensureMorningTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS morning_post_push (
      user_id INTEGER NOT NULL, day_key TEXT NOT NULL, post_id INTEGER NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day_key)
    )`);
  } catch (e) { /* tabla vieja sin permisos: el llamador lo registra */ }
}

async function sendMorningPostPush(db, opts) {
  const o = opts || {};
  const now = o.now ? (o.now instanceof Date ? o.now : new Date(o.now)) : new Date();
  const pushFn = o.pushFn || ((uid, payload) => require('./push').sendPush(uid, payload));
  const res = { checked: 0, sent: 0, skipped: 0, errors: [] };
  if (!db) { res.errors.push('no_db'); return res; }
  try { ensureMorningTable(db); } catch (e) { res.errors.push('table:' + e.message); return res; }
  let userIds = [];
  try {
    userIds = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all().map((r) => r.user_id);
  } catch (e) { res.errors.push('subs:' + e.message); return res; }
  for (const uid of userIds) {
    try {
      res.checked++;
      let tz = DEFAULT_TZ, lang = 'es', stopped = 0;
      try { const s = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(uid); if (s && s.timezone) tz = s.timezone; } catch (e) {}
      try {
        const u = db.prepare('SELECT lang, COALESCE(publishing_stopped,0) AS stopped FROM users WHERE id = ?').get(uid);
        if (u) { if (u.lang === 'en') lang = 'en'; stopped = Number(u.stopped) || 0; }
      } catch (e) {}
      if (stopped) { res.skipped++; continue; }
      if (!inMorningWindow(now, tz)) { res.skipped++; continue; }
      const dayKey = dayKeyInTz(now, tz);
      if (!dayKey) { res.skipped++; continue; }
      let already = null;
      try { already = db.prepare('SELECT 1 AS x FROM morning_post_push WHERE user_id = ? AND day_key = ?').get(uid, dayKey); } catch (e) {}
      if (already) { res.skipped++; continue; }
      // (LOTE RITUAL-1-OPCION · 6/11) Un posteo por día: si hoy no hay
      // nada programado, se genera el posteo del día ANTES de decidir
      // la push (ensureTodayPost es idempotente: si ya existe, no hace
      // nada; si la generación falla, se sigue con lo que haya — sin
      // posteo hoy, silencio, como siempre). Opcional: sin ensure, el
      // barrido anda igual que antes.
      if (typeof o.ensureTodayPost === 'function') {
        try { await o.ensureTodayPost(uid, tz, now); } catch (e) { console.error('[morning-post-push] ensure hoy:', e.message); }
      }
      let posts = [];
      try {
        posts = db.prepare(`SELECT id, scheduled_at, status FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL`).all(uid);
      } catch (e) { res.errors.push('posts:' + uid + ':' + e.message); continue; }
      const post = pickTodayPost(posts, tz, now);
      if (!post) { res.skipped++; continue; }
      const t = morningText(lang);
      let r = null;
      try { r = await pushFn(uid, { title: t.title, body: t.body, url: '/#/app/ritual', data: { postId: String(post.id) } }); }
      catch (e) { r = { ok: false, reason: 'throw:' + e.message }; }
      if (r && (r.ok || Number(r.sent) > 0)) {
        try {
          db.prepare('INSERT OR IGNORE INTO morning_post_push (user_id, day_key, post_id) VALUES (?, ?, ?)').run(uid, dayKey, post.id);
          res.sent++;
        } catch (e) { res.errors.push('mark:' + e.message); }
      } else { res.skipped++; }
    } catch (e) { res.errors.push('user:' + uid + ':' + e.message); }
  }
  return res;
}

module.exports = {
  sendMorningPostPush, pickTodayPost, dayKeyInTz, hourInTz, inMorningWindow,
  morningText, ensureMorningTable, MORNING_START_HOUR, MORNING_END_HOUR,
};
