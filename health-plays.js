// health-plays.js — JUGADAS ROJO→VERDE: ejecución automática (2026-10-22,
// mandato de Valentino; reconstruido 2026-10-23 sobre HEAD v350).
//
// En v322 el termómetro (launch-analytics.js) ASIGNA la jugada por causa
// dominante y la registra en health_interventions. Este módulo la EJECUTA
// contra los sistemas reales:
//
//  · calidad        → la semana entra en revisión reforzada (sus posteos
//                     quedan needs_review=1: doble QA antes de mostrarse),
//                     el fundamento se marca vencido para su relectura en
//                     el barrido real (refreshDigestsSweep, lun 06:30) y la
//                     próxima Carta del cliente abre con el ajuste
//                     (buildAccountAnalysis consume el opener guardado).
//  · desconexión    → UN toque con valor real vía el canal de relación
//                     (chat + relacion_messages + libro proactive_log),
//                     respetando el TECHO COMPARTIDO: máx. 1 toque extra
//                     por semana entre TODOS los sistemas que escriben en
//                     proactive_log ([trigger:], [relacion:], [oportunidad:],
//                     [health:]).
//  · sin material   → semana 100% IA: el ritual de fotos de esa semana se
//                     salta (albumRitualSweep consulta aiOnlyWeekActive) y
//                     el cliente recibe UNA línea avisándolo.
//  · culpa nuestra  → prioridad de regeneración (los reintentos pendientes
//                     de sweep_failures quedan para ya) + pieza extra de
//                     compensación sin costo: clon borrador de su pieza de
//                     mejor rendimiento histórico (la definición de v322).
//  · comercial      → aviso amable con link de pago de un toque (email si
//                     el canal está configurado; si no, chat). Si cancela:
//                     pregunta de salida de un toque (link firmado, sin
//                     login) y cuenta guardada 30 días (efecto registrado).
//
// CONTRATO (duro):
//  · Cada ejecución se escribe en health_interventions (la tabla de v322,
//    SIN tablas paralelas): status sigue el ciclo abierta/resuelta de
//    analytics; la ejecución vive en execution_status ('pendiente' |
//    'ejecutada'), con detail (qué se hizo) o reason (por qué no corrió).
//  · Idempotencia: UNA intervención activa (status='abierta') por
//    cuenta+causa; una jugada ya ejecutada no se re-ejecuta.
//  · Fail-closed: si la jugada no puede correr queda 'pendiente' con
//    motivo — JAMÁS marcada ejecutada.
//  · PROHIBIDO: descuentos automáticos por estar en rojo (ninguna jugada
//    toca precios ni planes) y romper el techo de proactive_log.
'use strict';

const crypto = require('crypto');
const LA = require('./launch-analytics');

const BASE_URL = () => (process.env.APP_URL || process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
// Prefijos de proactive_log que cuentan como TOQUE EXTRA entregado.
// '[relacion:mitad:sin-toque:...]' NO cuenta: es el registro de que NO se
// tocó (el silencio de relacion.js no consume el techo de nadie).
const EXTRA_TOUCH_PREFIXES = ['[trigger:', '[relacion:bienvenida]', '[relacion:mitadsemana]', '[oportunidad:', '[health:'];

/* ---------------- schema (aditivo sobre la tabla de v322) ---------------- */
function ensurePlaysSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS health_interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'abierta',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT, days_to_resolve REAL
  )`);
  for (const col of [
    `execution_status TEXT NOT NULL DEFAULT 'pendiente'`,
    `detail TEXT NOT NULL DEFAULT ''`,
    `reason TEXT NOT NULL DEFAULT ''`,
    `executed_at TEXT`,
    `week_key TEXT NOT NULL DEFAULT ''`,
  ]) {
    try { db.exec(`ALTER TABLE health_interventions ADD COLUMN ${col}`); } catch (e) { /* ya existe */ }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS health_play_effects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, kind TEXT NOT NULL, week_key TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'activa',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    consumed_at TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_hpe_user_kind ON health_play_effects(user_id, kind, status)`);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS proactive_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      idea_title TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function setEffect(db, userId, kind, weekKey, payload) {
  ensurePlaysSchema(db);
  const prev = db.prepare(`SELECT id FROM health_play_effects WHERE user_id = ? AND kind = ? AND week_key = ? AND status = 'activa' LIMIT 1`).get(userId, kind, weekKey || '');
  const pj = JSON.stringify(payload || {});
  if (prev) { db.prepare('UPDATE health_play_effects SET payload = ? WHERE id = ?').run(pj, prev.id); return prev.id; }
  const r = db.prepare('INSERT INTO health_play_effects (user_id, kind, week_key, payload) VALUES (?, ?, ?, ?)').run(userId, kind, weekKey || '', pj);
  return Number(r.lastInsertRowid);
}
function getEffect(db, userId, kind, weekKey) {
  try {
    const r = db.prepare(`SELECT * FROM health_play_effects WHERE user_id = ? AND kind = ? AND status = 'activa'
      ${weekKey != null ? 'AND week_key = ?' : ''} ORDER BY id DESC LIMIT 1`).get(...(weekKey != null ? [userId, kind, weekKey] : [userId, kind]));
    if (!r) return null;
    let payload = {}; try { payload = JSON.parse(r.payload || '{}'); } catch (e) {}
    return { ...r, payload };
  } catch (e) { return null; }
}

/* ---------------- intervenciones: registro idempotente ------------------ */
function openIntervention(db, userId, cause) {
  ensurePlaysSchema(db);
  try {
    return db.prepare(`SELECT * FROM health_interventions WHERE user_id = ? AND cause = ? AND status = 'abierta' ORDER BY id ASC LIMIT 1`).get(userId, cause) || null;
  } catch (e) { return null; }
}
function ensureIntervention(db, userId, cause, playName) {
  const found = openIntervention(db, userId, cause);
  if (found) return found;
  const wk = LA.currentWeekKey();
  const r = db.prepare(`INSERT INTO health_interventions (user_id, cause, play, status, execution_status, week_key)
    VALUES (?, ?, ?, 'abierta', 'pendiente', ?)`).run(userId, cause, playName || (LA.PLAYS[cause] || {}).play || cause, wk);
  return db.prepare('SELECT * FROM health_interventions WHERE id = ?').get(Number(r.lastInsertRowid));
}
function markExecuted(db, id, detail) {
  try {
    db.prepare(`UPDATE health_interventions SET execution_status = 'ejecutada', executed_at = datetime('now'),
      detail = ?, reason = '' WHERE id = ?`).run(String(detail || '').slice(0, 500), id);
  } catch (e) {}
}
function markPending(db, id, reason) {
  try {
    db.prepare(`UPDATE health_interventions SET execution_status = 'pendiente', reason = ? WHERE id = ?`)
      .run(String(reason || 'no_pudo_correr').slice(0, 300), id);
  } catch (e) {}
}

/* ---------------- utilidades ------------------------------------------- */
function userTz(db, userId) {
  try {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    return (r && r.timezone) || 'America/Argentina/Buenos_Aires';
  } catch (e) { return 'America/Argentina/Buenos_Aires'; }
}
function chatInsert(db, userId, text) {
  db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?, ?, ?)').run(userId, 'assistant', text);
}
function trackEvent(db, userId, name, props) {
  try {
    db.prepare('INSERT INTO events (user_id, session_id, name, props) VALUES (?, ?, ?, ?)')
      .run(userId || null, '', name, JSON.stringify(props || {}).slice(0, 2000));
  } catch (e) { /* el instrumento nunca frena la jugada */ }
}
// Semana (lunes→domingo) en la tz del cliente, como rango UTC para
// proactive_log.created_at (mismo criterio que relacion.js).
function weekRangeUtc(tz, now) {
  try {
    const rel = require('./relacion')._internal;
    const ymd = rel.localYmd(tz, now || new Date());
    return rel.weekRangeUtc(tz, ymd);
  } catch (e) {
    const d = now || new Date();
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    return [monday.toISOString().slice(0, 19).replace('T', ' '), new Date(monday.getTime() + 7 * 864e5).toISOString().slice(0, 19).replace('T', ' ')];
  }
}
// EL TECHO COMPARTIDO: toques extra de ESTA semana en proactive_log,
// contando TODOS los sistemas que escriben ahí. >= 1 → no sale otro.
function extraTouchesThisWeek(db, userId, now) {
  const tz = userTz(db, userId);
  const [ws, we] = weekRangeUtc(tz, now);
  try {
    const like = EXTRA_TOUCH_PREFIXES.map(() => 'idea_title LIKE ?').join(' OR ');
    const r = db.prepare(`SELECT COUNT(*) AS n FROM proactive_log WHERE user_id = ? AND created_at >= ? AND created_at < ? AND (${like})`)
      .get(userId, ws, we, ...EXTRA_TOUCH_PREFIXES.map(p => p + '%'));
    return (r && r.n) || 0;
  } catch (e) { return 0; }
}
function logTouch(db, userId, key) {
  try { db.prepare('INSERT INTO proactive_log (user_id, idea_title) VALUES (?, ?)').run(userId, key); } catch (e) {}
}

/* ---------------- jugada: CALIDAD --------------------------------------- */
// Relectura de fundamento por defecto: el digest guardado se marca vencido
// (fuentes web/feed con 40 días) y el barrido real de los lunes 06:30
// (server.refreshDigestsSweep) lo re-lee de su IG/web — sus reglas de
// staleness miran exactamente estas marcas. Sin digest no hay nada que
// marcar: lo devuelve y la jugada decide.
function markDigestStale(db, userId) {
  try {
    const r = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
    if (!r || !r.digest_json) return { ok: false, reason: 'sin_fundamento_guardado' };
    const d = JSON.parse(r.digest_json);
    if (!d || typeof d !== 'object') return { ok: false, reason: 'fundamento_ilegible' };
    const old = new Date(Date.now() - 40 * 864e5).toISOString();
    d.fuentes = d.fuentes || {};
    if (d.fuentes.web) d.fuentes.web.at = old;
    if (d.fuentes.feed) d.fuentes.feed.at = old;
    if (!d.fuentes.web && !d.fuentes.feed) d.fuentes.web = { at: old };
    db.prepare('UPDATE client_digest SET digest_json = ? WHERE user_id = ?').run(JSON.stringify(d), userId);
    return { ok: true, via: 'digest_marcado_vencido' };
  } catch (e) { return { ok: false, reason: 'digest_error: ' + e.message }; }
}
const CARTA_OPENER = {
  es: 'antes que nada, el ajuste de esta semana: reforcé la revisión de tus posteos (pasan por doble control antes de que los veas) y volví a leer tu Instagram y tu web para que lo que viene se parezca más a vos.',
  en: 'first, this week\u2019s adjustment: I reinforced the review of your posts (they go through a double check before you see them) and re-read your Instagram and website so what comes next sounds more like you.',
};
async function playCalidad(db, user, ctx) {
  const uid = user.id;
  const wk = LA.currentWeekKey();
  let marked = 0;
  try {
    const r = db.prepare(`UPDATE posts SET needs_review = 1 WHERE user_id = ? AND week_key = ?
      AND status IN ('draft', 'scheduled') AND COALESCE(needs_review, 0) = 0`).run(uid, wk);
    marked = (r && r.changes) || 0;
  } catch (e) { return { executed: false, reason: 'revision_reforzada_fallo: ' + e.message }; }
  let digest;
  if (ctx.deps && typeof ctx.deps.refreshDigest === 'function') {
    try { digest = await ctx.deps.refreshDigest(db, uid); } catch (e) { digest = { ok: false, reason: 'refresh_fallo: ' + e.message }; }
    if (!digest) digest = { ok: true, via: 'refresh_inyectado' };
  } else {
    digest = markDigestStale(db, uid);
  }
  if (!digest.ok && !marked) return { executed: false, reason: 'sin_semana_ni_fundamento (' + (digest.reason || 'sin_detalle') + ')' };
  const lang = user.lang === 'en' ? 'en' : 'es';
  setEffect(db, uid, 'carta_opener', wk, { text: CARTA_OPENER[lang], cause: 'calidad' });
  return { executed: true, detail: `revision_reforzada: ${marked} posteo(s) de la semana en doble QA · fundamento: ${digest.ok ? (digest.via || 'releido') : 'sin marcar (' + (digest.reason || '?') + ')'} · carta abre con el ajuste` };
}

/* ---------------- jugada: DESCONEXIÓN ----------------------------------- */
function touchContent(db, user, lang) {
  const uid = user.id;
  // Dato real o nada (filosofía de relacion.js): la próxima salida o el
  // mejor posteo reciente. Sin dato verdadero no hay toque.
  try {
    const nx = db.prepare(`SELECT caption, scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled'
      AND scheduled_at > datetime('now') ORDER BY scheduled_at ASC LIMIT 1`).get(uid);
    if (nx) {
      const tema = String(nx.caption || '').split('\n')[0].slice(0, 48);
      return lang === 'en'
        ? `hi! 💙 just so you know: your next post${tema ? ` "${tema}"` : ''} is already set to go out on its own. everything is moving on this side.`
        : `hola! 💙 te cuento: tu próximo posteo${tema ? ` "${tema}"` : ''} ya quedó listo para salir solo. de este lado viene todo en marcha.`;
    }
  } catch (e) {}
  try {
    const best = db.prepare(`SELECT caption, ig_likes FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at > datetime('now', '-30 days') AND COALESCE(ig_likes, 0) > 0
      ORDER BY (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) DESC LIMIT 1`).get(uid);
    if (best) {
      const tema = String(best.caption || '').split('\n')[0].slice(0, 48);
      return lang === 'en'
        ? `hi! 💙 your post${tema ? ` "${tema}"` : ''} is still bringing likes (${best.ig_likes}). want me to lean into more like that next week?`
        : `hola! 💙 tu posteo${tema ? ` "${tema}"` : ''} sigue sumando likes (${best.ig_likes}). hacemos más de ese estilo la semana que viene?`;
    }
  } catch (e) {}
  return null;
}
async function playDesconexion(db, user, ctx) {
  const uid = user.id;
  if (extraTouchesThisWeek(db, uid, ctx.now) >= 1) {
    return { executed: false, reason: 'techo_semanal_proactive_log' };
  }
  const lang = user.lang === 'en' ? 'en' : 'es';
  let text = null;
  if (ctx.deps && typeof ctx.deps.touchText === 'function') {
    try { text = await ctx.deps.touchText(db, user); } catch (e) { text = null; }
  } else {
    text = touchContent(db, user, lang);
  }
  if (!text) return { executed: false, reason: 'sin_dato_real_para_el_toque' };
  if (ctx.deps && typeof ctx.deps.sendTouch === 'function') {
    const r = await ctx.deps.sendTouch(db, user, text);
    if (!r || !r.ok) return { executed: false, reason: 'toque_no_entregado: ' + ((r && r.reason) || 'sin_motivo') };
  } else {
    // Canal de relación real: burbuja al volver (relacion_messages) + chat
    // + libro compartido. Nunca push (regla de relacion.js).
    try { require('./relacion').initSchema(db); } catch (e) {}
    try {
      db.prepare(`INSERT INTO relacion_messages (user_id, kind, text, ref_key, status) VALUES (?, 'health_toque', ?, ?, 'pending')`)
        .run(uid, text, LA.currentWeekKey());
    } catch (e) { return { executed: false, reason: 'relacion_no_disponible: ' + e.message }; }
    try { chatInsert(db, uid, text); } catch (e) {}
  }
  logTouch(db, uid, '[health:toque_valor]');
  return { executed: true, detail: 'toque con valor vía relación (chat + burbuja), registrado en proactive_log' };
}

/* ---------------- jugada: SIN MATERIAL ---------------------------------- */
async function playSinMaterial(db, user, ctx) {
  const uid = user.id;
  const wk = LA.currentWeekKey();
  setEffect(db, uid, 'ai_only_week', wk, { cause: 'sin_material' });
  const lang = user.lang === 'en' ? 'en' : 'es';
  const line = lang === 'en'
    ? 'this week goes out anyway: I create everything with AI, I don\u2019t need anything from you 💙'
    : 'esta semana sale igual: armo todo con IA, no necesito nada de vos 💙';
  if (ctx.deps && typeof ctx.deps.sendLine === 'function') {
    const r = await ctx.deps.sendLine(db, user, line);
    if (!r || !r.ok) return { executed: false, reason: 'mensaje_no_entregado: ' + ((r && r.reason) || 'sin_motivo') };
  } else {
    try { chatInsert(db, uid, line); } catch (e) { return { executed: false, reason: 'chat_no_disponible: ' + e.message }; }
  }
  return { executed: true, detail: 'semana 100% IA marcada (el ritual de fotos se salta) + mensaje de una línea en el chat' };
}
// Lo consulta albumRitualSweep (server.js): con semana IA total activa,
// esa semana NO se le piden fotos a esta cuenta.
function aiOnlyWeekActive(db, userId, weekKey) {
  try { return !!getEffect(db, userId, 'ai_only_week', weekKey || LA.currentWeekKey()); } catch (e) { return false; }
}

/* ---------------- jugada: CULPA NUESTRA --------------------------------- */
async function playCulpaNuestra(db, user, ctx) {
  const uid = user.id;
  const wk = LA.currentWeekKey();
  // Pieza extra de compensación, sin costo de IA: clon borrador de su
  // pieza de mejor rendimiento histórico (definición textual de v322).
  // Se resuelve PRIMERO: si no hay pieza fuente ni generador inyectado,
  // la jugada queda pendiente SIN efectos parciales (fail-closed limpio).
  let src = null;
  try {
    src = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'published'
      ORDER BY (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) DESC, published_at DESC LIMIT 1`).get(uid);
  } catch (e) {}
  if (!src && !(ctx.deps && typeof ctx.deps.generateExtraPiece === 'function')) {
    return { executed: false, reason: 'sin_pieza_fuente_para_compensar' };
  }
  // Prioridad de regeneración: los reintentos que el sistema ya tiene
  // agendados para esta cuenta quedan para YA (el barrido de reintentos
  // de scheduler/server los levanta en su próxima pasada).
  let prioritized = 0;
  try {
    const r = db.prepare(`UPDATE sweep_failures SET next_retry_at = datetime('now') WHERE user_id = ?`).run(uid);
    prioritized = (r && r.changes) || 0;
  } catch (e) { /* sin tabla de reintentos: la prioridad queda como efecto */ }
  setEffect(db, uid, 'regen_prioridad', wk, { cause: 'culpa_nuestra', sweep_failures_priorizadas: prioritized });
  let extraId = null;
  if (ctx.deps && typeof ctx.deps.generateExtraPiece === 'function') {
    const r = await ctx.deps.generateExtraPiece(db, user, src);
    if (!r || !r.ok) return { executed: false, reason: 'pieza_extra_no_generada: ' + ((r && r.reason) || 'sin_motivo') };
    extraId = r.post_id || null;
  } else {
    try {
      const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, carousel_paths, tipo, week_key, source)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, 'health_compensation')`)
        .run(uid, src.image_path || '', src.caption || '', src.hashtags || '', src.media_type || 'image', src.carousel_paths || '', src.tipo || '', wk);
      extraId = Number(r.lastInsertRowid);
    } catch (e) {
      try {
        const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, week_key)
          VALUES (?, ?, ?, ?, 'draft', ?, ?)`).run(uid, src.image_path || '', src.caption || '', src.hashtags || '', src.media_type || 'image', wk);
        extraId = Number(r.lastInsertRowid);
      } catch (e2) { return { executed: false, reason: 'pieza_extra_fallo: ' + e2.message }; }
    }
  }
  const lang = user.lang === 'en' ? 'en' : 'es';
  try {
    chatInsert(db, uid, lang === 'en'
      ? 'this one is on me: I added an extra piece to your week, free, and your regeneration goes first in line 💙'
      : 'esta es culpa mía: te sumé una pieza extra a tu semana, sin costo, y tu regeneración pasa primera en la fila 💙');
  } catch (e) {}
  return { executed: true, detail: `prioridad de regeneración (${prioritized} reintento(s) adelantados) + pieza extra de compensación #${extraId} (clon de su mejor pieza, sin costo)` };
}

/* ---------------- jugada: COMERCIAL ------------------------------------- */
function paymentLinkFor(db, user) {
  // Un toque desde el aviso a su pantalla de plan/pago. Sin checkout
  // firmado nuevo: el link cae en su cuenta (Ajustes → Mi plan), que es
  // donde viven el botón de pago MP y el portal de Stripe.
  return `${BASE_URL()}/#/app/ajustes`;
}
async function playComercial(db, user, ctx) {
  const uid = user.id;
  const lang = user.lang === 'en' ? 'en' : 'es';
  const link = (ctx.deps && typeof ctx.deps.paymentLinkFor === 'function')
    ? await ctx.deps.paymentLinkFor(db, user) : paymentLinkFor(db, user);
  if (!link) return { executed: false, reason: 'sin_link_de_pago' };
  // PROHIBIDO acá: cualquier descuento. El aviso es amable y temprano,
  // con el link — el precio de su plan no se toca jamás.
  const subject = lang === 'en' ? 'A quick hand with your payment 💙' : 'Una mano con tu pago 💙';
  const text = lang === 'en'
    ? `hi! 💙 I noticed a hiccup with your payment and I don\u2019t want your posts to stop. You can fix it in one tap here: ${link} — and if anything looks off, just reply to me.`
    : `hola! 💙 noté un problema con tu pago y no quiero que tus posteos se frenen. Lo resolvés en un toque acá: ${link} — y si ves algo raro, escribime.`;
  let channel = null;
  if (ctx.deps && typeof ctx.deps.sendNotice === 'function') {
    const r = await ctx.deps.sendNotice(db, user, { subject, text, link });
    if (!r || !r.ok) return { executed: false, reason: 'aviso_no_entregado: ' + ((r && r.reason) || 'sin_motivo') };
    channel = r.channel || 'inyectado';
  } else {
    const emailMod = require('./email');
    if (emailMod.emailConfigured() && user.email) {
      const r = await emailMod.sendEmail({ to: user.email, subject, html: `<p style="font-size:15px;line-height:1.6">${text.replace(link, `<a href="${link}">${link}</a>`)}</p>`, text });
      if (r && r.ok) channel = 'email';
      else if (r && r.skipped) channel = null; // sin RESEND_API_KEY: cae al chat, honestamente
      else return { executed: false, reason: 'email_fallo_transitorio' };
    }
    if (!channel) {
      try { chatInsert(db, uid, text); channel = 'chat'; } catch (e) { return { executed: false, reason: 'sin_canal_de_aviso: ' + e.message }; }
    }
  }
  return { executed: true, detail: `aviso amable de pago por ${channel} con link de un toque (sin descuento)` };
}

/* ---------------- cancelación: salida de un toque + 30 días -------------- */
const EXIT_REASONS = ['precio', 'sin_tiempo', 'no_vendio', 'otro'];
function exitSecret() {
  try { return require('./approval').approvalSecret(); } catch (e) { return process.env.APPROVAL_SECRET || process.env.SESSION_SECRET || ''; }
}
function signExitAnswer(userId, reason, expHours = 720) {
  const exp = Math.floor(Date.now() / 1000) + Math.floor(Number(expHours) * 3600);
  const sig = crypto.createHmac('sha256', exitSecret()).update(`exit:${userId}:${reason}:${exp}`).digest('hex');
  return { sig, exp };
}
function verifyExitAnswer(userId, reason, sig, exp) {
  const expN = Number(exp);
  if (!Number.isFinite(expN) || expN <= Math.floor(Date.now() / 1000)) return false;
  if (!EXIT_REASONS.includes(String(reason))) return false;
  let expected;
  try { expected = crypto.createHmac('sha256', exitSecret()).update(`exit:${userId}:${reason}:${expN}`).digest('hex'); }
  catch (e) { return false; }
  const a = Buffer.from(String(sig || '')), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Al cancelarse la cuenta: pregunta de salida de UN toque (links firmados
// sin login, 30 días de validez — la misma ventana de guardado) y la
// cuenta queda guardada 30 días (efecto cuenta_guardada con su fecha).
// Idempotente: una sola pregunta por cuenta.
function handleCancellation(db, userId, deps) {
  ensurePlaysSchema(db);
  let user = null;
  try { user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId); } catch (e) {}
  if (!user || user.plan_status !== 'cancelled') return { ok: false, reason: 'cuenta_no_cancelada' };
  if (getEffect(db, userId, 'pregunta_salida', null)) return { ok: true, already: true };
  const until = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  setEffect(db, userId, 'cuenta_guardada', '', { until, dias: 30 });
  const lang = user.lang === 'en' ? 'en' : 'es';
  const base = BASE_URL();
  const links = EXIT_REASONS.map((r) => {
    const { sig, exp } = signExitAnswer(userId, r, 720);
    return { reason: r, url: `${base}/api/health/exit-answer?u=${userId}&r=${r}&sig=${sig}&exp=${exp}` };
  });
  const labels = lang === 'en'
    ? { precio: 'price', sin_tiempo: 'no time', no_vendio: 'it didn\u2019t sell for me', otro: 'something else' }
    : { precio: 'el precio', sin_tiempo: 'no tuve tiempo', no_vendio: 'no me vendió', otro: 'otra cosa' };
  const lineLinks = links.map(l => `${labels[l.reason]}: ${l.url}`).join('\n');
  const text = lang === 'en'
    ? `I\u2019m sorry to see you go 💙 Your account stays saved for 30 days (until ${until}) — if you come back, everything is right where you left it. One last tap, so I can do better: what weighed most?\n${lineLinks}`
    : `lamento que te vayas 💙 Tu cuenta queda guardada por 30 días (hasta el ${until}): si volvés, todo sigue como lo dejaste. Un último toque, para poder mejorar: ¿qué pesó más?\n${lineLinks}`;
  setEffect(db, userId, 'pregunta_salida', '', { until, links: links.map(l => l.reason) });
  let channel = 'chat';
  try { chatInsert(db, userId, text); } catch (e) { channel = 'none'; }
  if (deps && typeof deps.sendExit === 'function') {
    try { const r = deps.sendExit(db, user, { text, links, until }); if (r && r.ok) channel = r.channel || 'email'; } catch (e) {}
  } else {
    try {
      const emailMod = require('./email');
      if (emailMod.emailConfigured() && user.email) {
        const htmlLinks = links.map(l => `<a href="${l.url}">${labels[l.reason]}</a>`).join(' · ');
        emailMod.sendEmail({ to: user.email, subject: lang === 'en' ? 'Your account stays saved for 30 days 💙' : 'Tu cuenta queda guardada por 30 días 💙',
          html: `<p style="font-size:15px;line-height:1.6">${lang === 'en' ? 'One last tap, so I can do better: what weighed most?' : 'Un último toque, para poder mejorar: ¿qué pesó más?'}</p><p>${htmlLinks}</p>`, text })
          .then(r => { /* fire-and-forget: el chat ya la lleva */ }).catch(() => {});
        channel = 'chat+email';
      }
    } catch (e) {}
  }
  trackEvent(db, userId, 'health_exit_question', { channel, until });
  return { ok: true, channel, until };
}

/* ---------------- motor -------------------------------------------------- */
const PLAY_RUNNERS = {
  calidad: playCalidad,
  desconexion: playDesconexion,
  sin_material: playSinMaterial,
  culpa_nuestra: playCulpaNuestra,
  comercial: playComercial,
};

async function runPlayForIntervention(db, intervention, deps, now) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(intervention.user_id);
  if (!user) { markPending(db, intervention.id, 'usuario_inexistente'); return { executed: false, reason: 'usuario_inexistente' }; }
  const runner = PLAY_RUNNERS[intervention.cause];
  if (!runner) { markPending(db, intervention.id, 'causa_sin_jugada: ' + intervention.cause); return { executed: false, reason: 'causa_sin_jugada' }; }
  let out;
  try { out = await runner(db, user, { deps: deps || {}, now: now || new Date() }); }
  catch (e) { out = { executed: false, reason: 'error: ' + e.message }; }
  if (out && out.executed) {
    markExecuted(db, intervention.id, out.detail || '');
    trackEvent(db, intervention.user_id, 'health_play_executed', { cause: intervention.cause, play: intervention.play });
  } else {
    markPending(db, intervention.id, (out && out.reason) || 'no_pudo_correr');
    trackEvent(db, intervention.user_id, 'health_play_pending', { cause: intervention.cause, reason: (out && out.reason) || '' });
  }
  return out;
}

// Barrido principal: el termómetro decide quién está en rojo (healthMap
// también sincroniza las intervenciones de v322); este motor ejecuta la
// jugada de cada intervención abierta todavía no ejecutada. También
// detecta cancelaciones y dispara la salida de un toque.
async function runHealthPlays(db, opts) {
  opts = opts || {};
  const deps = opts.deps || {};
  ensurePlaysSchema(db);
  const summary = { revisadas: 0, ejecutadas: 0, pendientes: 0, salidas: 0, detalle: [] };
  // El termómetro se lee por su superficie pública: accountsOverview
  // computa la salud de cada cuenta y SINCRONIZA las intervenciones de
  // las cuentas en rojo (syncInterventions de v322 corre adentro).
  let accounts = [];
  try { accounts = LA.accountsOverview(db, opts).accounts || []; } catch (e) { accounts = []; }
  // Asegura la intervención de cada cuenta con jugada asignada (play
  // viene null en verde/nuevo; esto cubre también el amarillo con causa
  // — sin eso, sin_material y desconexión jamás podrían correr: sus
  // causas no siempre alcanzan el rojo por sí solas).
  for (const a of accounts) {
    if (a && a.cause && a.play) ensureIntervention(db, a.user_id, a.cause, a.play.play);
  }
  let open = [];
  try { open = db.prepare(`SELECT * FROM health_interventions WHERE status = 'abierta' ORDER BY id ASC`).all(); } catch (e) {}
  for (const iv of open) {
    if (iv.execution_status === 'ejecutada') continue;
    summary.revisadas++;
    const out = await runPlayForIntervention(db, iv, deps, opts.now);
    if (out && out.executed) summary.ejecutadas++; else summary.pendientes++;
    summary.detalle.push({ user_id: iv.user_id, cause: iv.cause, executed: !!(out && out.executed), reason: (out && out.reason) || '', detail: (out && out.detail) || '' });
  }
  // Cancelaciones (cualquier vía: endpoint, MP, Stripe): salida de un toque.
  try {
    const cancelled = db.prepare(`SELECT id FROM users WHERE plan_status = 'cancelled'`).all();
    for (const u of cancelled) {
      const r = handleCancellation(db, u.id, deps);
      if (r && r.ok && !r.already) summary.salidas++;
    }
  } catch (e) {}
  return summary;
}

/* ---------------- opener de la Carta (calidad) ---------------------------- */
function cartaOpenerFor(db, userId) {
  const fx = getEffect(db, userId, 'carta_opener', null);
  return fx && fx.payload && fx.payload.text ? fx.payload.text : null;
}
function consumeCartaOpener(db, userId) {
  try {
    const fx = getEffect(db, userId, 'carta_opener', null);
    if (fx) db.prepare(`UPDATE health_play_effects SET status = 'consumida', consumed_at = datetime('now') WHERE id = ?`).run(fx.id);
    return !!fx;
  } catch (e) { return false; }
}

/* ---------------- endpoints + jobs --------------------------------------- */
function registerHealthPlays(app, db, guards) {
  ensurePlaysSchema(db);
  const express = require('express');
  const json = express.json();
  const requireAdminToken = guards && guards.requireAdminToken;

  // Respuesta de la pregunta de salida: link firmado, sin login. Guarda la
  // respuesta en users.cancel_reason (la columna que ya lee el panel de
  // growth) y marca la pregunta como respondida.
  app.get('/api/health/exit-answer', (req, res) => {
    const uid = Number(req.query.u) || 0;
    const reason = String(req.query.r || '');
    if (!uid || !verifyExitAnswer(uid, reason, req.query.sig, req.query.exp)) {
      return res.status(403).send('<p>Este link ya no es válido 💙</p>');
    }
    try { db.prepare('UPDATE users SET cancel_reason = ? WHERE id = ?').run(reason, uid); } catch (e) {}
    try {
      const fx = getEffect(db, uid, 'pregunta_salida', null);
      if (fx) db.prepare(`UPDATE health_play_effects SET status = 'respondida', consumed_at = datetime('now') WHERE id = ?`).run(fx.id);
    } catch (e) {}
    trackEvent(db, uid, 'health_exit_answer', { reason });
    res.send('<div style="font-family:sans-serif;max-width:480px;margin:40px auto;text-align:center;color:#0A1E33"><h2>Gracias por contarnos 💙</h2><p>Tu cuenta queda guardada por 30 días. Si volvés, todo sigue como lo dejaste.</p></div>');
  });

  if (requireAdminToken) {
    app.get('/api/admin/health-plays/state', requireAdminToken, (req, res) => {
      let interventions = [], effects = [];
      try { interventions = db.prepare('SELECT * FROM health_interventions ORDER BY id DESC LIMIT 100').all(); } catch (e) {}
      try { effects = db.prepare('SELECT kind, status, COUNT(*) AS n FROM health_play_effects GROUP BY kind, status').all(); } catch (e) {}
      res.json({ ok: true, interventions, effects,
        nota: 'Jugadas rojo→verde: execution_status ejecutada = la jugada corrió de verdad; pendiente = fail-closed con motivo en reason. Prohibido: descuentos automáticos y más de 1 toque extra semanal (proactive_log).' });
    });
    app.post('/api/admin/health-plays/run', requireAdminToken, json, async (req, res) => {
      try { res.json({ ok: true, ...(await runHealthPlays(db, {})) }); }
      catch (e) { res.status(500).json({ ok: false, error: 'run_failed' }); }
    });
  }
}

function startHealthPlayJobs(db, deps) {
  const run = () => { runHealthPlays(db, { deps }).catch((e) => console.error('[health-plays]', e.message)); };
  const t0 = setTimeout(run, 90000); if (t0.unref) t0.unref();
  const iv = setInterval(run, 6 * 3600 * 1000); if (iv.unref) iv.unref();
}

module.exports = {
  ensurePlaysSchema,
  runHealthPlays,
  runPlayForIntervention,
  handleCancellation,
  cartaOpenerFor,
  consumeCartaOpener,
  aiOnlyWeekActive,
  paymentLinkFor,
  signExitAnswer,
  verifyExitAnswer,
  registerHealthPlays,
  startHealthPlayJobs,
  _internal: {
    ensureIntervention, openIntervention, markExecuted, markPending,
    extraTouchesThisWeek, markDigestStale, touchContent, setEffect, getEffect,
    PLAY_RUNNERS, EXIT_REASONS, CARTA_OPENER,
  },
};
