// alerta-despegue.js — ALERTA DESPEGUE (mejora 1/5, aprobada 30/10).
//
// Si un posteo rinde mucho más que lo normal en las primeras horas, Posty
// avisa EN EL MOMENTO (mensaje en el chat = in-app + push) para que el
// dueño lo aproveche: responder comentarios, compartir en historias.
// Hoy se entera al día siguiente (o en el festejo de wins de las 11:00).
//
// REGLAS DURAS (ver SPEC.md; este módulo las hace cumplir en código):
//  · Umbral contra la MEDIANA REAL de alcance de la cuenta, nunca un
//    número fijo: despega si reach >= 2x la mediana de sus posteos previos
//    medidos. Sin mediana real (menos de 5 posteos previos con reach > 0),
//    NO hay alerta: silencio, nunca un número inventado.
//  · Alcance SOLO real > 0 desde post_metrics (ingesta de Instagram).
//    Sin fila durable con reach > 0, no hay alerta (sin_dato).
//  · Una sola alerta por posteo: tabla alerta_despegue con post_id como
//    PRIMARY KEY + pre-chequeo antes de avisar. Un posteo que todavía no
//    cruza el umbral NO se marca: se vuelve a evaluar en cada barrido
//    mientras siga dentro de la ventana de 12 h.
//  · La alerta NO publica nada sola: solo avisa. Este módulo no llama a
//    ninguna función de publicación, no manda email y no toca autopilot.
//  · Push por el canal que YA existe: push.js multi-transporte (webpush +
//    FCM + APNs, mismo sendPush que usan wins y los avisos de publicación).
//    No pasa por push-oficina.emitir(): esa puerta AGRUPA las buenas
//    noticias/celebraciones y las retiene (silencio 22–8, topes), y esto es
//    acción del momento, no festejo. El festejo sigue siendo wins.js.
//  · In-app = mensaje del asistente en el chat (precedente: wins-chat y
//    wins.js), que el dueño ve al abrir la app; el push es el timbre que
//    lo lleva al posteo (deep link #/app/post/<id>, ya ruteado por el
//    cliente web y por el tap nativo de la mejora 6).
//  · Nunca tira: cada candidato se procesa en su propio try/catch y el
//    barrido devuelve conteos. Sin credenciales de IG o sin suscripción
//    push, el mensaje en el chat igual queda (si el chat falla y el push
//    también, no se marca: se reintenta en el próximo barrido en ventana).
//  · SILENCIO NOCTURNO 22–8 (Lote 8, 31/10): entre las 22:00 y las 08:00
//    en la ZONA DE LA CUENTA (settings.timezone, mismo default que
//    server.js userTz()), la alerta NO suena ni llega: queda RETENIDA en
//    alerta_despegue_retenida y se entrega a las 08:00 (primer barrido
//    diurno; el barrido corre cada 30 min, así que la entrega cae a las
//    08:00 o en el primer barrido posterior). Nunca se pierde en silencio:
//    si el alcance crece antes de la mañana, la fila retenida se actualiza
//    con los números frescos. Fail-closed: ante duda de zona o de cómputo,
//    se retiene para la mañana, nunca se envía de noche.
//    No pasa por la puerta agrupada de la oficina a propósito: esa puerta
//    usa una zona GLOBAL, solo empuja push (sin chat) y agrupa
//    celebraciones; el despegue exige zona de la cuenta, push + chat y
//    entrega a las 08:00. Se reutilizan su ventana 22–8 y su forma de
//    computar la hora local con Intl, no su puerta.
'use strict';

const DESPEGUE_FACTOR = 2;        // 2x la mediana (mismo factor que wins, pero sobre mediana, no promedio)
const DESPEGUE_MIN_BASELINE = 5;  // mínimo de posteos previos medidos para que la mediana sea "lo normal"
const DESPEGUE_BASELINE_N = 20;   // últimos N posteos previos medidos que entran a la mediana
const DESPEGUE_WINDOW_HOURS = 12; // "primeras horas": solo posteos publicados en las últimas 12 h
const DESPEGUE_REFRESH_STALE_MIN = 30; // re-traer de IG si el caché tiene más de 30 min
const SILENCIO_DESDE = 22; // 22:00 (ventana fija, no configurable)
const SILENCIO_HASTA = 8;  // 08:00
const TZ_FALLBACK = 'America/Argentina/Buenos_Aires'; // mismo default que server.js userTz()

function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

// Mediana de valores reales (> 0). Lista vacía -> 0 (el llamador decide
// con baseline_n; 0 nunca es una mediana válida para alertar).
function median(values) {
  const xs = (values || []).map(num).filter((v) => v > 0).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 1) return xs[mid];
  return (xs[mid - 1] + xs[mid]) / 2;
}

// Decisión pura (testeable, sin DB ni red).
// reach: alcance real del posteo candidato. baseline: alcances de posteos previos.
function despegeDecision(reach, baseline) {
  const s = num(reach);
  const prev = (baseline || []).map(num).filter((v) => v > 0);
  const med = median(prev);
  const base = { median: med, baseline_n: prev.length, ratio: med > 0 ? s / med : 0 };
  if (!(s > 0)) return { despega: false, reason: 'sin_dato', ...base };
  if (prev.length < DESPEGUE_MIN_BASELINE) return { despega: false, reason: 'sin_baseline', ...base };
  if (med <= 0) return { despega: false, reason: 'sin_baseline', ...base };
  const ratio = s / med;
  if (ratio >= DESPEGUE_FACTOR) return { despega: true, reason: 'despegue', ...base, ratio };
  return { despega: false, reason: 'bajo_mediana', ...base, ratio };
}

function fmtInt(n, lang) {
  return Math.round(num(n)).toLocaleString(lang === 'en' ? 'en-US' : 'es-AR');
}

// Texto del múltiplo: 2 exacto -> "el doble de" / "twice"; si no, 1 decimal.
function vecesTxt(ratio, lang) {
  const r1 = Math.round(num(ratio) * 10) / 10;
  if (r1 === 2) return lang === 'en' ? 'twice' : 'el doble de';
  const s = lang === 'en' ? String(r1) : String(r1).replace('.', ',');
  return lang === 'en' ? `${s} times` : `${s} veces`;
}

// Payload push + texto de chat, con números reales y nada más.
// El copy es acción (responder, historias), no festejo ni promesa.
function buildCopy({ postId, reach, median: med, ratio, lang }) {
  const l = lang === 'en' ? 'en' : 'es';
  const rFmt = fmtInt(reach, l);
  const mFmt = fmtInt(med, l);
  const v = vecesTxt(ratio, l);
  if (l === 'en') {
    return {
      title: '🚀 Your post is taking off',
      body: `${rFmt} people have seen it — ${v} your usual median. Reply to comments and share it to stories while it's hot 👇`,
      chat: `🚀 your post is taking off! ${rFmt} people have seen it — ${v} your usual median (${mFmt}). make the most of it now: reply to comments and share it to stories 👇`,
      url: `/#/app/post/${postId}`,
      data: { postId, tipo: 'despegue' },
    };
  }
  return {
    title: '🚀 Tu posteo está despegando',
    body: `${rFmt} personas ya lo vieron — ${v} tu mediana habitual. Respondé los comentarios y compartilo en historias para aprovecharlo 👇`,
    chat: `🚀 tu posteo está despegando! ${rFmt} personas ya lo vieron — ${v} tu mediana habitual (${mFmt}). aprovechalo ahora: respondé los comentarios y compartilo en historias 👇`,
    url: `/#/app/post/${postId}`,
    data: { postId, tipo: 'despegue' },
  };
}

// ---- Silencio nocturno 22–8 en la zona de la cuenta (Lote 8) ----
// La zona de la cuenta es settings.timezone, mismo default que server.js
// userTz(). Ante zona inválida o cómputo dudoso: fallback, nunca inventar.

function resolverTz(raw) {
  const tz = String(raw || '').trim();
  if (!tz) return TZ_FALLBACK;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; }
  catch (e) { return TZ_FALLBACK; }
}

function tzDeCuenta(db, userId) {
  try {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    return resolverTz(r && r.timezone);
  } catch (e) { return TZ_FALLBACK; }
}

// Partes calendario en la zona (hourCycle h23: 0–23, sin el "24" de hour12).
function partesEnZona(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute };
}

function horaEnZona(ms, tz) {
  try { return partesEnZona(ms, tz).h; } catch (e) { return NaN; }
}

// Ventana fija 22–8. Ante duda de cómputo: noche (fail-closed: se retiene,
// nunca se envía de noche).
function esSilencioNocturno(ms, tz) {
  const h = horaEnZona(ms, tz);
  if (!Number.isFinite(h)) return true;
  return h >= SILENCIO_DESDE || h < SILENCIO_HASTA;
}

// Fecha/hora local en zona -> ms UTC (m 1-indexed, como partesEnZona;
// iteración de punto fijo del offset; converge en 2–3 pasos; 08:00 existe
// en todas las zonas y días).
function zonedToUtcMs(y, m, d, h, min, tz) {
  const base = Date.UTC(y, m - 1, d, h, min, 0);
  let guess = base;
  for (let i = 0; i < 3; i++) {
    let off;
    try {
      const p = partesEnZona(guess, tz);
      off = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, 0) - Math.floor(guess / 1000) * 1000;
    } catch (e) { return null; }
    const next = base - off;
    if (next === guess) break;
    guess = next;
  }
  try {
    const chk = partesEnZona(guess, tz);
    if (chk.h !== h || chk.d !== d || chk.m !== m) return null;
  } catch (e) { return null; }
  return guess;
}

// Próximo 08:00 en la zona, estrictamente después de ms. null si no se
// pudo computar (el flush entrega entonces en el primer barrido diurno).
function proximoDespertarMs(ms, tz) {
  try {
    const p = partesEnZona(ms, tz);
    const hoy8 = zonedToUtcMs(p.y, p.m, p.d, SILENCIO_HASTA, 0, tz);
    if (hoy8 !== null && hoy8 > ms) return hoy8;
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    return zonedToUtcMs(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), SILENCIO_HASTA, 0, tz);
  } catch (e) { return null; }
}

// Canales por defecto, compartidos por el barrido y el flush (mismo
// comportamiento: chat en el chat del dueño + push por push.js).
function makePushFn(opts) {
  if (opts && typeof opts.pushFn === 'function') return opts.pushFn;
  return async (uid, copy) => {
    try {
      const { sendPush } = require('./push');
      return await sendPush(uid, { title: copy.title, body: copy.body, url: copy.url, data: copy.data });
    } catch (e) { return { ok: false, reason: 'push_error' }; }
  };
}

function makeChatFn(db, opts) {
  if (opts && typeof opts.chatFn === 'function') return opts.chatFn;
  return (uid, text) => {
    try {
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', String(text).slice(0, 2000));
      return true;
    } catch (e) { return false; }
  };
}

// Flush matinal: entrega las retenidas cuando ya es de día en la zona de
// cada cuenta y pasó su 08:00. Sin canal (chat y push fallan), la fila
// queda para el próximo barrido: nunca se pierde en silencio. No depende
// de la ventana de 12 h del barrido: una retenida se entrega aunque el
// posteo ya haya salido de la ventana.
async function flushDespegueRetenido(db, opts = {}) {
  const out = { entregadas: 0, pendientes: 0, sin_canal: 0, errors: 0 };
  try { ensureSchema(db); } catch (e) { return { ...out, errors: 1 }; }
  const nowMs = opts.nowMs || Date.now();
  let rows = [];
  try { rows = db.prepare('SELECT * FROM alerta_despegue_retenida ORDER BY deliver_at_ms ASC').all(); } catch (e) { return { ...out, errors: 1 }; }
  const pushFn = makePushFn(opts);
  const chatFn = makeChatFn(db, opts);
  for (const r of rows) {
    try {
      const tz = tzDeCuenta(db, r.user_id);
      if (esSilencioNocturno(nowMs, tz)) { out.pendientes++; continue; }
      if (r.deliver_at_ms !== null && r.deliver_at_ms !== undefined && nowMs < r.deliver_at_ms) { out.pendientes++; continue; }
      const copy = buildCopy({ postId: r.post_id, reach: r.reach, median: r.median_reach, ratio: r.ratio, lang: r.lang || 'es' });
      let chatOk = false, pushOk = false;
      try { chatOk = !!chatFn(r.user_id, copy.chat); } catch (e) { chatOk = false; }
      try { const pr = await pushFn(r.user_id, copy); pushOk = !!(pr && pr.ok); } catch (e) { pushOk = false; }
      if (!chatOk && !pushOk) { out.sin_canal++; continue; }
      try {
        db.prepare('INSERT INTO alerta_despegue (post_id, user_id, reach, median_reach, ratio) VALUES (?,?,?,?,?)')
          .run(r.post_id, r.user_id, Math.round(num(r.reach)), num(r.median_reach), num(r.ratio));
      } catch (e) { /* ya marcada por otro barrido: igual se libera la retenida */ }
      try { db.prepare('DELETE FROM alerta_despegue_retenida WHERE post_id = ?').run(r.post_id); } catch (e) {}
      out.entregadas++;
    } catch (e) { out.errors++; }
  }
  return out;
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS alerta_despegue (
    post_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    reach INTEGER NOT NULL,
    median_reach REAL NOT NULL,
    ratio REAL NOT NULL,
    alerted_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerta_despegue_user ON alerta_despegue(user_id, alerted_at)`);
  // Retención nocturna (Lote 8): una fila por posteo, visible y constatable.
  // deliver_at_ms NULL = no se pudo computar el próximo 08:00: el flush la
  // entrega en el primer barrido diurno.
  db.exec(`CREATE TABLE IF NOT EXISTS alerta_despegue_retenida (
    post_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    reach INTEGER NOT NULL,
    median_reach REAL NOT NULL,
    ratio REAL NOT NULL,
    lang TEXT NOT NULL DEFAULT 'es',
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    deliver_at_ms INTEGER
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerta_despegue_retenida_user ON alerta_despegue_retenida(user_id, deliver_at_ms)`);
}

function alreadyAlerted(db, postId) {
  try {
    const r = db.prepare('SELECT post_id FROM alerta_despegue WHERE post_id = ?').get(postId);
    return !!r;
  } catch (e) { return false; }
}

function parseFetchedAt(s) {
  if (!s) return NaN;
  const t = String(s).trim().replace(' ', 'T');
  const d = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(t) ? t : t + 'Z');
  return d.getTime();
}

// Barrido: evalúa los posteos publicados en las últimas 12 h y avisa.
// opts (todo inyectable para tests; en producción se usan los defaults):
//   pushFn(post, copy) -> { ok }   (default: push.sendPush)
//   chatFn(userId, text) -> true   (default: INSERT en chat_messages)
//   fetchFn(post) -> { reach, likes, comments, saved } | null
//     (default: insights de IG con upsert en post_metrics; null = usar caché)
//   nowMs (default: Date.now())
async function sweepDespegue(db, opts = {}) {
  const out = { evaluated: 0, alerted: 0, skipped: { sin_dato: 0, sin_baseline: 0, bajo_mediana: 0, sin_canal: 0, ya_alertado: 0 }, errors: 0, retenidas: 0, ya_retenidas: 0, flush: null };
  try { ensureSchema(db); } catch (e) { return { ...out, errors: 1 }; }
  const nowMs = opts.nowMs || Date.now();
  // Entrega matinal: las retenidas de la noche salen en el primer barrido
  // diurno (el barrido corre cada 30 min, así que también hace de flush).
  try { out.flush = await flushDespegueRetenido(db, opts); } catch (e) { out.flush = { entregadas: 0, pendientes: 0, sin_canal: 0, errors: 1 }; }
  let cands = [];
  try {
    cands = db.prepare(`
      SELECT p.id, p.user_id, p.caption, p.ig_media_id, p.published_at,
             COALESCE(u.lang, 'es') AS lang
      FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.status = 'published'
        AND datetime(p.published_at) >= datetime('now', '-${DESPEGUE_WINDOW_HOURS} hours')
        AND COALESCE(p.ig_media_id, '') != '' AND p.ig_media_id NOT LIKE 'demo_%'
        AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
      ORDER BY p.published_at DESC
    `).all();
  } catch (e) { return { ...out, errors: 1 }; }

  const pushFn = makePushFn(opts);
  const chatFn = makeChatFn(db, opts);

  for (const p of cands) {
    try {
      if (alreadyAlerted(db, p.id)) { out.skipped.ya_alertado++; continue; }
      out.evaluated++;
      let stored = null;
      try { stored = db.prepare('SELECT reach, likes, comments, saved, fetched_at FROM post_metrics WHERE post_id = ?').get(p.id) || null; } catch (e) { stored = null; }
      let metrics = stored;
      const fetchedMs = stored ? parseFetchedAt(stored.fetched_at) : NaN;
      const stale = !stored || !Number.isFinite(fetchedMs) || (nowMs - fetchedMs > DESPEGUE_REFRESH_STALE_MIN * 60 * 1000);
      if (stale) {
        try {
          let fresh = null;
          if (typeof opts.fetchFn === 'function') {
            fresh = await opts.fetchFn(p);
          } else {
            const { getCreds, fetchMediaInsights } = require('./insights');
            const creds = getCreds(db, p.user_id);
            if (creds) fresh = await fetchMediaInsights(p.ig_media_id, creds.accessToken);
          }
          if (fresh && Number.isFinite(Number(fresh.reach))) {
            db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved, fetched_at)
                        VALUES (?,?,?,?,?,datetime('now'))
                        ON CONFLICT(post_id) DO UPDATE SET reach=excluded.reach, likes=excluded.likes,
                        comments=excluded.comments, saved=excluded.saved, fetched_at=excluded.fetched_at`)
              .run(p.id, num(fresh.reach) | 0, num(fresh.likes) | 0, num(fresh.comments) | 0, num(fresh.saved) | 0);
            metrics = fresh;
          }
        } catch (e) { /* sin fresco: se usa el caché si lo hay; sin caché no hay alerta */ }
      }
      const reach = metrics ? num(metrics.reach) : 0;
      if (!(reach > 0)) { out.skipped.sin_dato++; continue; }
      let baseline = [];
      try {
        baseline = db.prepare(`
          SELECT m.reach AS reach
          FROM post_metrics m JOIN posts p2 ON p2.id = m.post_id
          WHERE p2.user_id = ? AND p2.status = 'published' AND p2.id != ?
            AND COALESCE(p2.ig_media_id, '') NOT LIKE 'demo_%'
            AND COALESCE(p2.published_at, p2.created_at) < ?
            AND m.reach > 0
          ORDER BY COALESCE(p2.published_at, p2.created_at) DESC
          LIMIT ${DESPEGUE_BASELINE_N}
        `).all(p.user_id, p.id, p.published_at).map((r) => num(r.reach));
      } catch (e) { baseline = []; }
      const dec = despegeDecision(reach, baseline);
      if (!dec.despega) { out.skipped[dec.reason] = (out.skipped[dec.reason] || 0) + 1; continue; }
      // Silencio nocturno 22–8 en la zona de la cuenta: no suena ni llega
      // de noche; queda retenida y se entrega a las 08:00 (flush del
      // barrido). La fila se actualiza si el alcance crece antes de la mañana.
      const tz = tzDeCuenta(db, p.user_id);
      if (esSilencioNocturno(nowMs, tz)) {
        try {
          const ya = db.prepare('SELECT post_id FROM alerta_despegue_retenida WHERE post_id = ?').get(p.id);
          const deliverAt = proximoDespertarMs(nowMs, tz);
          db.prepare(`INSERT INTO alerta_despegue_retenida (post_id, user_id, reach, median_reach, ratio, lang, detected_at, deliver_at_ms)
                      VALUES (?,?,?,?,?,?,datetime('now'),?)
                      ON CONFLICT(post_id) DO UPDATE SET reach=excluded.reach, median_reach=excluded.median_reach, ratio=excluded.ratio, lang=excluded.lang`)
            .run(p.id, p.user_id, Math.round(reach), dec.median, dec.ratio, p.lang || 'es', deliverAt);
          if (ya) out.ya_retenidas++; else out.retenidas++;
        } catch (e) { out.errors++; }
        continue;
      }
      const copy = buildCopy({ postId: p.id, reach, median: dec.median, ratio: dec.ratio, lang: p.lang });
      let chatOk = false, pushOk = false;
      try { chatOk = !!chatFn(p.user_id, copy.chat); } catch (e) { chatOk = false; }
      try { const r = await pushFn(p.user_id, copy); pushOk = !!(r && r.ok); } catch (e) { pushOk = false; }
      if (!chatOk && !pushOk) { out.skipped.sin_canal++; continue; } // sin marca: reintenta en el próximo barrido en ventana
      try {
        db.prepare('INSERT INTO alerta_despegue (post_id, user_id, reach, median_reach, ratio) VALUES (?,?,?,?,?)')
          .run(p.id, p.user_id, Math.round(reach), dec.median, dec.ratio);
      } catch (e) {
        // UNIQUE por post_id: otro barrido ya lo marcó -> cuenta como ya alertado, nunca duplicar.
        out.skipped.ya_alertado++;
        continue;
      }
      out.alerted++;
    } catch (e) { out.errors++; }
  }
  return out;
}

module.exports = {
  sweepDespegue, flushDespegueRetenido, despegeDecision, median, buildCopy, ensureSchema, alreadyAlerted,
  esSilencioNocturno, proximoDespertarMs, resolverTz, tzDeCuenta,
  DESPEGUE_FACTOR, DESPEGUE_MIN_BASELINE, DESPEGUE_BASELINE_N, DESPEGUE_WINDOW_HOURS, DESPEGUE_REFRESH_STALE_MIN,
  SILENCIO_DESDE, SILENCIO_HASTA,
};
