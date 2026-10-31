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
'use strict';

const DESPEGUE_FACTOR = 2;        // 2x la mediana (mismo factor que wins, pero sobre mediana, no promedio)
const DESPEGUE_MIN_BASELINE = 5;  // mínimo de posteos previos medidos para que la mediana sea "lo normal"
const DESPEGUE_BASELINE_N = 20;   // últimos N posteos previos medidos que entran a la mediana
const DESPEGUE_WINDOW_HOURS = 12; // "primeras horas": solo posteos publicados en las últimas 12 h
const DESPEGUE_REFRESH_STALE_MIN = 30; // re-traer de IG si el caché tiene más de 30 min

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
  const out = { evaluated: 0, alerted: 0, skipped: { sin_dato: 0, sin_baseline: 0, bajo_mediana: 0, sin_canal: 0, ya_alertado: 0 }, errors: 0 };
  try { ensureSchema(db); } catch (e) { return { ...out, errors: 1 }; }
  const nowMs = opts.nowMs || Date.now();
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

  const pushFn = opts.pushFn || (async (uid, copy) => {
    try {
      const { sendPush } = require('./push');
      return await sendPush(uid, { title: copy.title, body: copy.body, url: copy.url, data: copy.data });
    } catch (e) { return { ok: false, reason: 'push_error' }; }
  });
  const chatFn = opts.chatFn || ((uid, text) => {
    try {
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', String(text).slice(0, 2000));
      return true;
    } catch (e) { return false; }
  });

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
  sweepDespegue, despegeDecision, median, buildCopy, ensureSchema, alreadyAlerted,
  DESPEGUE_FACTOR, DESPEGUE_MIN_BASELINE, DESPEGUE_BASELINE_N, DESPEGUE_WINDOW_HOURS, DESPEGUE_REFRESH_STALE_MIN,
};
