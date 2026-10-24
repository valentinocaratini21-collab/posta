// showcase.js — 📣 PRUEBA SOCIAL REAL (2026-10-24, v370).
// Diseño aprobado por Valentino (2026-10-24): el hueco listo para la
// primera historia de un cliente PAGO. Hoy el módulo NO se ve en la home:
// se enciende solo cuando el primer cliente pago dice que sí, con su
// historia real, aprobada por él y guardada literal.
//
// LAS TRES PIEZAS:
//  1) EL ENCENDIDO — una pregunta kind 'showcase' dentro de Posty pregunta
//     (posty-questions.js la ofrece vía candidateFor, con el mismo techo
//     de 1 pregunta/semana y la misma tarjeta de Schedule). SOLO cuentas
//     pagas reales: plan_status 'active' + plan esencial/pro/total —
//     NUNCA trial, NUNCA 'free' (Founder/cortesía/dogfood).
//  2) EL BORRADOR — determinístico, CERO IA: mejor posteo publicado de la
//     cuenta (post_metrics), métrica calculada del publish_ledger (la
//     fuente de verdad de publicación) y frase propuesta en el idioma de
//     la cuenta con su nombre/rubro/ciudad/dato. El cliente la aprueba o
//     la edita: el texto final aprobado ES el que se publica, literal.
//  3) LA HOME — GET /api/showcase devuelve SOLO casos 'active' con
//     consentimiento registrado Y cuenta todavía paga al leer: si el
//     cliente revoca o da de baja, la historia desaparece sola. Sin
//     registro durable no hay caso (doctrina de confiabilidad).
//
// EL MOMENTO DE LA PREGUNTA (criterio declarado): la cuenta se vuelve
// elegible a los 14 días de PAGA OBSERVADA — el reloj nace la primera vez
// que el motor ve la cuenta paga (first_paid_seen_at, asentado por
// observe()), nunca con una fecha retroactiva inventada: sin registro
// durable no hay promesa. Además exige ≥1 publicación real en el ledger
// (una historia sin trabajo publicado no es una historia). Se pregunta
// UNA vez; el «ahora no» (dismiss) o la expiración la consumen; hay UNA
// sola insistencia más, recién a los 42 días (la memoria estándar del
// sistema de preguntas); jamás una tercera. Si existe un caso en
// cualquier estado posterior (draft/active/declined/revoked), la
// pregunta no vuelve nunca más.
'use strict';

const clientDigest = require('./client-digest');
const rubroId = require('./rubro-id');

const PAID_PLANS = new Set(['esencial', 'pro', 'total']);
const MIN_PAID_DAYS = 14;
const MAX_ASKS = 2;
const REASK_MIN_DAYS = 42;
const METRIC_REFRESH_DAYS = 7;
const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// PERSISTENCIA — la tabla también se crea en db.js; este ensure es
// defensivo, mismo patrón que posty-questions.ensureTable.
// ---------------------------------------------------------------------------
function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS showcase_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'watching',
      first_paid_seen_at TEXT NOT NULL DEFAULT '',
      consent_at TEXT NOT NULL DEFAULT '',
      quote_text TEXT NOT NULL DEFAULT '',
      business_name TEXT NOT NULL DEFAULT '',
      rubro_label TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      post_id INTEGER NOT NULL DEFAULT 0,
      metric_type TEXT NOT NULL DEFAULT '',
      metric_value INTEGER NOT NULL DEFAULT 0,
      metric_source TEXT NOT NULL DEFAULT '',
      metric_at TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT 'es',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) { /* db.js la crea igual */ }
}

function nowIso(nowMs) {
  return new Date(typeof nowMs === 'number' ? nowMs : Date.now()).toISOString();
}
function parseWhen(s) {
  if (!s) return NaN;
  const t = Date.parse(String(s));
  if (Number.isFinite(t)) return t;
  return Date.parse(String(s).replace(' ', 'T') + 'Z');
}
function cleanText(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max || 280);
}

// ---------------------------------------------------------------------------
// LA COMPUERTA DE PAGO REAL — la única definición de "cliente pago" acá.
// ---------------------------------------------------------------------------
function userRow(db, uid) {
  try { return db.prepare('SELECT id, email, plan, plan_status, lang FROM users WHERE id = ?').get(uid) || null; }
  catch (e) { return null; }
}
function isPaidReal(db, uid) {
  const u = userRow(db, uid);
  return !!(u && u.plan_status === 'active' && PAID_PLANS.has(String(u.plan || '')));
}

function getCase(db, uid) {
  ensureTable(db);
  try { return db.prepare('SELECT * FROM showcase_cases WHERE user_id = ?').get(uid) || null; }
  catch (e) { return null; }
}

// OBSERVACIÓN DE PAGO: la primera vez que el motor ve la cuenta paga, el
// reloj de elegibilidad nace (y queda asentado). Si una cuenta con caso
// activo deja de estar paga, el caso se revoca solo (la historia no
// sobrevive a la relación) — publicCases además filtra al leer.
function observe(db, uid, nowMs) {
  ensureTable(db);
  const u = userRow(db, uid);
  if (!u) return null;
  let row = getCase(db, uid);
  if (isPaidReal(db, uid)) {
    if (!row) {
      db.prepare(`INSERT INTO showcase_cases (user_id, state, first_paid_seen_at, lang) VALUES (?, 'watching', ?, ?)`)
        .run(uid, nowIso(nowMs), u.lang === 'en' ? 'en' : 'es');
      row = getCase(db, uid);
    }
  } else if (row && row.state === 'active') {
    db.prepare(`UPDATE showcase_cases SET state = 'revoked', updated_at = datetime('now') WHERE user_id = ?`).run(uid);
    row = getCase(db, uid);
  }
  return row;
}

// ---------------------------------------------------------------------------
// LA MÉTRICA — siempre del publish_ledger, jamás texto libre.
// Racha de semanas (lunes UTC) con ≥1 publicación, contada hacia atrás
// desde la semana en curso (con una semana de gracia si la actual aún no
// publicó). Si la racha es ≥3 manda la racha; si no, el total publicado.
// ---------------------------------------------------------------------------
function mondayKeyOfYmd(ymd) {
  const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftDays(ymd, days) {
  const dt = new Date(String(ymd) + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function computeMetric(db, uid, nowMs) {
  let rows = [];
  try {
    rows = db.prepare(`SELECT created_at FROM publish_ledger WHERE user_id = ? AND status = 'published' AND COALESCE(kind, '') != 'boost'`).all(uid);
  } catch (e) { rows = []; }
  const total = rows.length;
  const weeks = new Set(rows.map((r) => mondayKeyOfYmd(r.created_at)));
  const todayYmd = new Date(typeof nowMs === 'number' ? nowMs : Date.now()).toISOString().slice(0, 10);
  let cursor = mondayKeyOfYmd(todayYmd);
  if (!weeks.has(cursor)) cursor = shiftDays(cursor, -7); // la semana en curso todavía puede publicar
  let streak = 0;
  while (weeks.has(cursor)) { streak++; cursor = shiftDays(cursor, -7); }
  if (streak >= 3) return { type: 'weeks_streak', value: streak, source: 'publish_ledger' };
  return { type: 'posts_published', value: total, source: 'publish_ledger' };
}
function hasPublishedWork(db, uid) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM publish_ledger WHERE user_id = ? AND status = 'published' AND COALESCE(kind, '') != 'boost'`).get(uid);
    return (r && r.n) > 0;
  } catch (e) { return false; }
}

function metricLabel(type, value, lang) {
  const en = lang === 'en';
  if (type === 'weeks_streak') {
    return en ? `${value} weeks in a row posting` : `${value} semanas seguidas publicando`;
  }
  return en ? `${value} posts published without lifting a finger` : `${value} posteos publicados sin tocar nada`;
}
function metricSentence(type, value, lang) {
  const en = lang === 'en';
  if (type === 'weeks_streak') {
    return en ? `that's ${value} weeks in a row posting now` : `ya van ${value} semanas seguidas publicando`;
  }
  return en ? `${value} posts published without me touching a thing` : `ya salieron ${value} posteos sin que yo toque nada`;
}

// ---------------------------------------------------------------------------
// EL MEJOR POSTEO — el publicado con más respuesta real (post_metrics:
// likes + comentarios×2 + guardados); las fotos van antes que los reels
// (el marco de la home muestra una imagen) y las historias nunca. Sin
// métricas todavía → el publicado más reciente.
// ---------------------------------------------------------------------------
function bestPost(db, uid) {
  try {
    return db.prepare(`
      SELECT p.id FROM posts p
      LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
        AND COALESCE(p.media_type, '') != 'story' AND COALESCE(p.image_path, '') != ''
      ORDER BY (CASE WHEN COALESCE(p.media_type, '') IN ('reel', 'video') THEN 1 ELSE 0 END),
        (COALESCE(m.likes, 0) + 2 * COALESCE(m.comments, 0) + COALESCE(m.saved, 0)) DESC,
        p.published_at DESC, p.id DESC
      LIMIT 1`).get(uid) || null;
  } catch (e) { return null; }
}

// La frase propuesta: primera persona del dueño, con SUS datos (nombre,
// rubro, ciudad si el fundamento la conoce, y el dato real). Es una
// PROPUESTA editable: lo que vale es el texto que él aprueba.
function proposedQuote(db, uid, lang, metric) {
  const en = lang === 'en';
  const snap = identitySnapshot(db, uid, lang);
  const who = snap.rubro_label
    ? `${snap.business_name} (${snap.rubro_label}${snap.city ? ', ' + snap.city : ''})`
    : snap.business_name;
  const dato = metricSentence(metric.type, metric.value, lang);
  return en
    ? `I'm with ${who} and Posty posts my whole week for me: ${dato}. I just watch my Instagram go out.`
    : `soy de ${who} y Posty me publica la semana solo: ${dato}. yo solo miro cómo queda mi Instagram.`;
}

// Identidad visible del caso: SOLO datos reales de la cuenta (perfil +
// fundamento). Ciudad vacía si el fundamento no la conoce — jamás se
// inventa una.
function identitySnapshot(db, uid, lang) {
  let business = '';
  let category = '';
  try {
    const p = db.prepare('SELECT business_name, category FROM profiles WHERE user_id = ?').get(uid);
    if (p) { business = cleanText(p.business_name, 80); category = String(p.category || ''); }
  } catch (e) {}
  let digest = null;
  try { digest = clientDigest.getDigest(db, uid); } catch (e) { digest = null; }
  if (!business && digest && digest.business) business = cleanText(digest.business, 80);
  let rubroKey = '';
  let subrubro = '';
  if (digest && digest.rubro_id && digest.rubro_id.rubro) {
    rubroKey = String(digest.rubro_id.rubro);
    subrubro = String(digest.rubro_id.subrubro || digest.subcat || '');
  }
  let rubroLabel = '';
  if (rubroKey) {
    try { rubroLabel = rubroId.labelFor(rubroKey, subrubro, lang) || ''; } catch (e) { rubroLabel = ''; }
    if (rubroLabel === 'Otro' || rubroLabel === 'Other') rubroLabel = '';
  }
  if (!rubroLabel && category && category !== 'otro') rubroLabel = cleanText(category, 40);
  return {
    business_name: business || 'Mi negocio',
    rubro_label: rubroLabel,
    city: digest && digest.ciudad ? cleanText(digest.ciudad, 60) : '',
  };
}

// ---------------------------------------------------------------------------
// LA PREGUNTA — candidata para Posty pregunta (la llama
// ensureWeeklyQuestion). Devuelve el candidato o null. La memoria de
// asks sale de las propias filas kind='showcase' (durable).
// ---------------------------------------------------------------------------
function askHistory(db, uid) {
  let rows = [];
  try {
    rows = db.prepare(`SELECT status, created_at FROM posty_questions WHERE user_id = ? AND kind = 'showcase' ORDER BY id`).all(uid);
  } catch (e) { rows = []; }
  const done = rows.filter((r) => ['answered', 'dismissed', 'expired'].includes(r.status));
  let last = NaN;
  for (const r of done) { const t = parseWhen(r.created_at); if (Number.isFinite(t) && (!Number.isFinite(last) || t > last)) last = t; }
  return { asks: done.length, lastAskAt: last };
}

const TEXTO_ES = 'contamos tu historia en la página de Posty? 📣 sería con tu mejor posteo, tus palabras y un dato real de tu cuenta. la ves y la aprobás antes de que salga — y la podés sacar cuando quieras.';
const TEXTO_EN = "can we share your story on Posty's page? 📣 it would feature your best post, your own words and one real number from your account. you see it and approve it before it goes live — and you can take it down anytime.";

function candidateFor(db, uid, nowMs, opts) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const row = observe(db, uid, now);
  if (!row || !isPaidReal(db, uid)) return null;
  // Un caso que ya avanzó (draft/active) o se cerró (declined/revoked)
  // apaga la pregunta para siempre.
  if (row.state !== 'watching') return null;
  const hist = askHistory(db, uid);
  if (hist.asks >= MAX_ASKS) {
    try { db.prepare(`UPDATE showcase_cases SET state = 'declined', updated_at = datetime('now') WHERE user_id = ? AND state = 'watching'`).run(uid); } catch (e) {}
    return null;
  }
  const seenAt = parseWhen(row.first_paid_seen_at);
  if (!Number.isFinite(seenAt) || (now - seenAt) < MIN_PAID_DAYS * DAY_MS) return null;
  if (hist.asks === 1 && Number.isFinite(hist.lastAskAt) && (now - hist.lastAskAt) < REASK_MIN_DAYS * DAY_MS) return null;
  if (!hasPublishedWork(db, uid)) return null;
  const lang = (opts && opts.lang) || (row.lang === 'en' ? 'en' : 'es');
  return {
    kind: 'showcase',
    qkey: 'showcase:ask',
    texto: lang === 'en' ? TEXTO_EN : TEXTO_ES,
    opciones: [{ label: lang === 'en' ? 'Yes, share it ✨' : 'Sí, contala ✨', value: 'si' }],
    allow_text: false,
    ref: { showcase: true },
  };
}

// ---------------------------------------------------------------------------
// EL SÍ → EL BORRADOR. Lo arma desde los datos reales de la cuenta y lo
// deja en estado 'draft': todavía NO es público (falta SU aprobación).
// ---------------------------------------------------------------------------
function applyYes(db, uid, nowMs) {
  ensureTable(db);
  if (!isPaidReal(db, uid)) return { ok: false, reason: 'not_paid' };
  let row = observe(db, uid, nowMs) || getCase(db, uid);
  if (row && (row.state === 'active' || row.state === 'declined' || row.state === 'revoked')) {
    return { ok: false, reason: 'closed' };
  }
  const u = userRow(db, uid);
  const lang = (u && u.lang === 'en') || (row && row.lang === 'en') ? 'en' : 'es';
  const metric = computeMetric(db, uid, nowMs);
  const bp = bestPost(db, uid);
  const snap = identitySnapshot(db, uid, lang);
  const quote = proposedQuote(db, uid, lang, metric);
  db.prepare(`INSERT INTO showcase_cases (user_id, state, first_paid_seen_at, quote_text, business_name, rubro_label, city, post_id, metric_type, metric_value, metric_source, metric_at, lang, updated_at)
    VALUES (?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET state = 'draft', quote_text = excluded.quote_text,
      business_name = excluded.business_name, rubro_label = excluded.rubro_label, city = excluded.city,
      post_id = excluded.post_id, metric_type = excluded.metric_type, metric_value = excluded.metric_value,
      metric_source = excluded.metric_source, metric_at = excluded.metric_at, lang = excluded.lang,
      updated_at = datetime('now')`)
    .run(uid, row && row.first_paid_seen_at ? row.first_paid_seen_at : nowIso(nowMs),
      quote, snap.business_name, snap.rubro_label, snap.city,
      bp ? bp.id : 0, metric.type, metric.value, metric.source, nowIso(nowMs), lang);
  return { ok: true, state: 'draft' };
}

// LA APROBACIÓN — el texto que él deja (editado o tal cual) es el que se
// publica, guardado literal, con su consentimiento y timestamp. La
// métrica se recalcula al aprobar (el dato más fresco, de la misma
// fuente) y queda asentada con su fuente y fecha.
function approve(db, uid, finalQuote, nowMs) {
  ensureTable(db);
  const row = getCase(db, uid);
  if (!row || row.state !== 'draft') return { ok: false, reason: 'no_draft' };
  if (!isPaidReal(db, uid)) return { ok: false, reason: 'not_paid' };
  const quote = cleanText(finalQuote, 280) || row.quote_text;
  if (!quote) return { ok: false, reason: 'empty' };
  const metric = computeMetric(db, uid, nowMs);
  db.prepare(`UPDATE showcase_cases SET state = 'active', quote_text = ?, consent_at = ?,
    metric_type = ?, metric_value = ?, metric_source = ?, metric_at = ?, updated_at = datetime('now')
    WHERE user_id = ?`)
    .run(quote, nowIso(nowMs), metric.type, metric.value, metric.source, nowIso(nowMs), uid);
  return { ok: true, state: 'active' };
}

// LA BAJA VOLUNTARIA — un toque y la historia deja de ser pública.
function revoke(db, uid) {
  ensureTable(db);
  const r = db.prepare(`UPDATE showcase_cases SET state = 'revoked', updated_at = datetime('now') WHERE user_id = ? AND state IN ('draft', 'active')`).run(uid);
  return { ok: true, changed: r.changes || 0 };
}

// ---------------------------------------------------------------------------
// LA LECTURA PÚBLICA — solo casos activos, con consentimiento, de cuentas
// que SIGUEN pagas al momento de leer. La métrica se refresca desde el
// ledger si tiene más de 7 días (la historia muestra el dato de hoy,
// siempre calculado de registros).
// ---------------------------------------------------------------------------
function publicCases(db, nowMs, limit) {
  ensureTable(db);
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  let rows = [];
  try {
    rows = db.prepare(`SELECT c.*, u.plan AS u_plan, u.plan_status AS u_status
      FROM showcase_cases c JOIN users u ON u.id = c.user_id
      WHERE c.state = 'active' AND c.consent_at != ''
      ORDER BY c.consent_at ASC LIMIT ?`).all(limit || 3);
  } catch (e) { rows = []; }
  const out = [];
  for (const c of rows) {
    if (c.u_status !== 'active' || !PAID_PLANS.has(String(c.u_plan || ''))) continue;
    let mType = c.metric_type, mValue = c.metric_value;
    const mAt = parseWhen(c.metric_at);
    if (!Number.isFinite(mAt) || (now - mAt) > METRIC_REFRESH_DAYS * DAY_MS) {
      const m = computeMetric(db, c.user_id, now);
      mType = m.type; mValue = m.value;
      try {
        db.prepare(`UPDATE showcase_cases SET metric_type = ?, metric_value = ?, metric_source = ?, metric_at = ? WHERE user_id = ?`)
          .run(m.type, m.value, m.source, nowIso(now), c.user_id);
      } catch (e) {}
    }
    out.push({
      user_id: c.user_id,
      business_name: c.business_name,
      rubro_label: c.rubro_label,
      city: c.city,
      quote_text: c.quote_text,
      lang: c.lang === 'en' ? 'en' : 'es',
      metric_type: mType,
      metric_value: mValue,
      metric_label: metricLabel(mType, mValue, c.lang === 'en' ? 'en' : 'es'),
      post_id: c.post_id || 0,
    });
  }
  return out;
}

// LA VISTA DEL CLIENTE (su tarjeta en Schedule): el borrador para
// aprobar/editar, o su historia activa con la salida en un toque.
function myShape(db, uid, nowMs) {
  const row = observe(db, uid, nowMs);
  if (!row || (row.state !== 'draft' && row.state !== 'active')) return null;
  return {
    state: row.state,
    business_name: row.business_name,
    rubro_label: row.rubro_label,
    city: row.city,
    quote_text: row.quote_text,
    lang: row.lang === 'en' ? 'en' : 'es',
    metric_label: metricLabel(row.metric_type, row.metric_value, row.lang === 'en' ? 'en' : 'es'),
    post_id: row.post_id || 0,
    consent_at: row.consent_at || '',
  };
}

// EL ADMIN SOLO MIRA — ningún camino crea un caso sin el consentimiento
// registrado del cliente (eso lo garantiza el diseño: no hay otra API).
function adminList(db) {
  ensureTable(db);
  try {
    return db.prepare(`SELECT c.*, u.email AS user_email, u.plan AS user_plan, u.plan_status AS user_status
      FROM showcase_cases c JOIN users u ON u.id = c.user_id ORDER BY c.updated_at DESC LIMIT 200`).all();
  } catch (e) { return []; }
}

module.exports = {
  ensureTable, observe, isPaidReal, getCase,
  computeMetric, metricLabel, bestPost, proposedQuote, identitySnapshot,
  candidateFor, applyYes, approve, revoke,
  publicCases, myShape, adminList,
  PAID_PLANS, MIN_PAID_DAYS, MAX_ASKS, REASK_MIN_DAYS,
};
