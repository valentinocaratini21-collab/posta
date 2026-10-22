// launch-analytics.js — ANALYTICS DE LANZAMIENTO (v322, mandato de Valentino 2026-10-22).
//
// Las 9 piezas viven acá para que server.js solo agregue rutas finas:
//  1) ÉPOCA DE LANZAMIENTO: las lecturas de medición filtran "desde la época"
//     por defecto; la era de prueba se consulta con el toggle era=all.
//     EXCEPCIÓN DURA (pedido textual): EL DINERO NO SE RESETEA — el ledger
//     api_costs se lee SIEMPRE completo, sin filtro de época, en todo el sistema.
//  2) TABLERO ÚNICO: funnel + plata + calidad + cohortes en una sola lectura.
//  3) ORIGEN (src) e idioma en los eventos del funnel.
//  4) POSTEOS POR CUENTA: monitoreo de calidad (no reemplaza la cola de revisión).
//  5) TERMÓMETRO DE SALUD por cuenta (reglas declaradas abajo, sin puntaje opaco).
//  6) ALERTAS automáticas con clave determinística (dedup por construcción).
//  7) CARTA DEL LUNES del fundador (fail-closed sin datos de lanzamiento).
//  8) CALIDAD DE POSTEOS: % que pasó todos los gates a la primera, ediciones.
//  9) DELTAS contra el período anterior equivalente, sin cruzar la época en silencio.
//
// REGLA DE VERDAD: ningún número sale sin fuente en la base. Lo que no se puede
// medir se devuelve null + nota, jamás una estimación silenciosa.
'use strict';

// ---------- 1) ÉPOCA ----------
// Default: 2027-01-01 00:00 America/Argentina/Buenos_Aires = 03:00 UTC.
// Configurable con POSTY_LAUNCH_EPOCH_ISO (cualquier ISO válido).
const DEFAULT_EPOCH_ISO = '2027-01-01T03:00:00.000Z';
function launchEpochMs() {
  const raw = String(process.env.POSTY_LAUNCH_EPOCH_ISO || '').trim();
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : Date.parse(DEFAULT_EPOCH_ISO);
}
function epochSql() { return new Date(launchEpochMs()).toISOString().slice(0, 19).replace('T', ' '); }
function eraOf(query) {
  const e = String((query && query.era) || 'launch').toLowerCase();
  return e === 'all' || e === 'todo' ? 'all' : 'launch';
}
// Condición SQL para una columna datetime TEXT ('YYYY-MM-DD HH:MM:SS', UTC).
function eraCond(col, era) {
  return era === 'all' ? { sql: '1=1', params: [] } : { sql: `datetime(${col}) >= datetime(?)`, params: [epochSql()] };
}
function eraInfo(era) {
  return { era, epoch_iso: new Date(launchEpochMs()).toISOString(), epoch_sql: epochSql(),
    launched: Date.now() >= launchEpochMs(),
    note: era === 'all' ? 'era completa: incluye la era de prueba' : 'desde la época de lanzamiento; la era de prueba se consulta con era=all' };
}

// ---------- 3) ORIGEN ----------
const CHANNELS = ['email', 'dm', 'referido', 'clinica', 'organico', 'directo', 'otro'];
function normalizeSrc(raw) {
  const s = String(raw || '').trim().toLowerCase().slice(0, 60);
  if (!s) return null;
  if (s.startsWith('clinica')) return 'clinica';
  if (s.includes('email') || s.includes('mail') || s === 'newsletter' || s.startsWith('ideas')) return 'email';
  if (s.includes('dm') || s.includes('mensaje')) return 'dm';
  if (s.includes('refer') || s === 'ref') return 'referido';
  if (s.includes('organico') || s.includes('organic') || s === 'ig' || s === 'instagram') return 'organico';
  if (s.includes('direct')) return 'directo';
  return 'otro';
}

// ---------- utilidades ----------
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function parseProps(t) { try { return JSON.parse(t || '{}') || {}; } catch (e) { return {}; } }
function delta(cur, prev) {
  cur = Number(cur) || 0; prev = Number(prev) || 0;
  if (!prev) return { cur, prev, delta_pct: cur ? 100 : 0, has_prev: false };
  return { cur, prev, delta_pct: Math.round((cur - prev) / prev * 1000) / 10, has_prev: true };
}
// Semana (lunes) de una fecha SQL — misma regla que el overview (lunes local del servidor).
function mondayOf(sqlDate) {
  const d = new Date(String(sqlDate).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d)) return null;
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const FUNNEL_STEPS = [
  { key: 'prueba_view', label: 'Visitaron la prueba' },
  { key: 'prueba_complete', label: 'Completaron el formulario' },
  { key: 'prueba_register', label: 'Crearon cuenta' },
  { key: 'ig_connect', label: 'Conectaron Instagram' },
  { key: 'week_generate_done', label: 'Semana generada' },
  { key: 'post_publish', label: 'Publicaron algo' },
  { key: 'payment_ok', label: 'Pagaron' },
];
const LEGACY_FUNNEL_MAP = {
  prueba_done: 'prueba_complete', registered: 'prueba_register',
  client_week_accepted: 'schedule_all', first_published: 'post_publish',
  subscribed: 'payment_ok', ig_connected: 'ig_connect',
};
// Únicos por paso en [desdeSql, hastaSql) leyendo events + legacy funnel_events.
function funnelUniques(db, name, fromSql, toSql) {
  const ids = new Set();
  try {
    const rows = db.prepare(`SELECT user_id, session_id FROM events
      WHERE name = ? AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`).all(name, fromSql, toSql);
    for (const r of rows) ids.add(r.user_id ? 'u:' + r.user_id : 's:' + (r.session_id || '?'));
  } catch (e) {}
  try {
    for (const [legacy, mapped] of Object.entries(LEGACY_FUNNEL_MAP)) {
      if (mapped !== name) continue;
      const rows = db.prepare(`SELECT user_id FROM funnel_events
        WHERE event = ? AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`).all(legacy, fromSql, toSql);
      for (const r of rows) ids.add(r.user_id ? 'u:' + r.user_id : 's:?');
    }
  } catch (e) {}
  return ids;
}
function funnelTotals(db, fromSql, toSql) {
  return FUNNEL_STEPS.map(s => ({ key: s.key, label: s.label, users: funnelUniques(db, s.key, fromSql, toSql).size }));
}
// Funnel separado por una dimensión de props ('src' | 'lang'). Los eventos sin la
// dimensión quedan en '(sin dato)' — la era de prueba es mayormente eso, y se declara.
function funnelByDim(db, dim, fromSql, toSql) {
  const out = {};
  try {
    const names = FUNNEL_STEPS.map(s => s.key);
    const rows = db.prepare(`SELECT name, user_id, session_id, props FROM events
      WHERE name IN (${names.map(() => '?').join(',')}) AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`).all(...names, fromSql, toSql);
    const sets = {};
    for (const r of rows) {
      const p = parseProps(r.props);
      let v = dim === 'src' ? normalizeSrc(p.src) : (p.lang ? String(p.lang).slice(0, 5) : null);
      if (!v) v = '(sin dato)';
      if (!sets[v]) sets[v] = {};
      if (!sets[v][r.name]) sets[v][r.name] = new Set();
      sets[v][r.name].add(r.user_id ? 'u:' + r.user_id : 's:' + (r.session_id || '?'));
    }
    for (const [v, byStep] of Object.entries(sets)) {
      out[v] = {};
      for (const s of FUNNEL_STEPS) out[v][s.key] = byStep[s.key] ? byStep[s.key].size : 0;
    }
  } catch (e) {}
  return out;
}
// Time-to-value: horas registro → primer posteo publicado (mediana/promedio/% en 24h).
function timeToValue(db, fromSql, toSql) {
  let ttv = { n: 0, avg_h: 0, med_h: 0, d1_pct: 0 };
  try {
    const rows = db.prepare(`SELECT (julianday(p.first_pub) - julianday(u.created_at)) * 24 AS h
      FROM users u JOIN (
        SELECT user_id, MIN(published_at) AS first_pub FROM posts
        WHERE status = 'published' AND published_at IS NOT NULL GROUP BY user_id
      ) p ON p.user_id = u.id
      WHERE datetime(u.created_at) >= datetime(?) AND datetime(u.created_at) < datetime(?)`).all(fromSql, toSql);
    const hs = rows.map(r => Number(r.h)).filter(h => h >= 0 && h < 24 * 60).sort((a, b) => a - b);
    if (hs.length) {
      const avg = hs.reduce((s, h) => s + h, 0) / hs.length;
      ttv = { n: hs.length, avg_h: r1(avg), med_h: r1(hs[Math.floor(hs.length / 2)]),
        d1_pct: r1(hs.filter(h => h <= 24).length / hs.length * 100) };
    }
  } catch (e) {}
  return ttv;
}

// ---------- 4) SEÑALES DEL CLIENTE POR CUENTA ----------
// Felicidad medible, desde fuentes reales:
//  · post_signals.client_signal (auto_signal=0: señales del cliente, no del autopilot):
//    approved / edited / rejected / rating_1..5.
//  · post_versions: cada edición guardada por chat cuenta como edición pedida.
//  · posts: approval, needs_review, img_redos (regeneraciones) y digest_hash
//    (sufijo ':sin-ancla' = la pieza no pasó el chequeo de pertenencia).
function accountSignals(db, uid, days) {
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const sig = { approved: 0, edited_signals: 0, rejected: 0, rating_low: 0, rating_high: 0 };
  try {
    const rows = db.prepare(`SELECT client_signal AS s, COUNT(*) AS n FROM post_signals
      WHERE user_id = ? AND COALESCE(auto_signal, 0) = 0 AND datetime(updated_at) >= datetime('now', ?)
      GROUP BY client_signal`).all(uid, '-' + d + ' days');
    for (const r of rows) {
      if (r.s === 'approved') sig.approved = r.n;
      else if (r.s === 'edited') sig.edited_signals = r.n;
      else if (r.s === 'rejected') sig.rejected = r.n;
      else if (r.s === 'rating_1' || r.s === 'rating_2') sig.rating_low += r.n;
      else if (r.s === 'rating_4' || r.s === 'rating_5') sig.rating_high += r.n;
    }
  } catch (e) {}
  let versions = 0;
  try { versions = db.prepare(`SELECT COUNT(*) AS n FROM post_versions WHERE user_id = ? AND datetime(created_at) >= datetime('now', ?)`).get(uid, '-' + d + ' days').n || 0; } catch (e) {}
  let postStats = { total: 0, needs_review: 0, img_redos: 0, sin_ancla: 0, published: 0 };
  try {
    const p = db.prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(needs_review), 0) AS nr, COALESCE(SUM(img_redos), 0) AS redos,
        SUM(CASE WHEN digest_hash LIKE '%:sin-ancla' THEN 1 ELSE 0 END) AS sa,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS pub
      FROM posts WHERE user_id = ? AND datetime(created_at) >= datetime('now', ?)`).get(uid, '-' + d + ' days');
    if (p) postStats = { total: p.total || 0, needs_review: p.nr || 0, img_redos: p.redos || 0, sin_ancla: p.sa || 0, published: p.pub || 0 };
  } catch (e) {}
  const decided = sig.approved + sig.rating_high + sig.rejected + sig.rating_low;
  return { days: d, ...sig, versions,
    edits: sig.edited_signals + versions,
    decided, approval_rate: decided ? r1((sig.approved + sig.rating_high) / decided * 100) : null,
    posts: postStats };
}

// ---------- 5) TERMÓMETRO + ESTRATEGIA ROJO→VERDE ----------
// Reglas declaradas (también viajan a la UI en health_rules):
//  ROJO si: pago vencido/fallido · ≥3 rechazos en 30d · cuenta paga sin publicar
//    hace 14+ días · posteo fallido sin resolver en 7d · semana paga atrasada.
//  AMARILLO si: aprobación <65% (con ≥3 decisiones) · ≥3 ediciones en 30d ·
//    sin actividad hace 5+ días · semana actual sin posteos · costo IA en alerta.
//  VERDE: el resto, con datos. 'nuevo': cuenta de <48h sin posteos todavía.
// CAUSA DOMINANTE (la señal que más pesa; define LA jugada):
//  comercial(100) > culpa_nuestra(90) > calidad(80) > sin_material(60) > desconexion(50).
const AI_COST_ALERT_PCT = 8;   // alerta: gasto IA del mes ≥ 8% del precio del plan
const AI_COST_CAP_PCT = 10;    // el tope duro del producto (costs.js) es 10%
const PLAYS = {
  comercial: { play: 'aviso_pago_amable', label: 'Aviso amable temprano con link de pago de un toque; si cancela igual: pregunta de salida de un toque y puerta abierta 30 días con todo guardado.' },
  culpa_nuestra: { play: 'compensacion', label: 'Prioridad de regeneración + compensación visible automática: una pieza extra esta semana (la de mejor rendimiento histórico de la cuenta; si no hay dato, un reel extra).' },
  calidad: { play: 'revision_reforzada', label: 'Su semana entra en revisión reforzada (doble QA) antes de mostrarse, el fundamento se re-lee de su IG/web, y su próxima Carta abre reconociendo el ajuste con el cambio concreto.' },
  sin_material: { play: 'semana_ia_total', label: 'Esta semana Posty genera todo con IA sin pedirle nada y se lo comunica en una línea: "esta semana sale igual, no necesito nada de vos".' },
  desconexion: { play: 'toque_valor', label: 'UN toque extra con valor real vía el sistema de relación (una idea concreta de su rubro/zona o una pieza sorpresa). Techo duro: 1 toque extra por semana.' },
};
const HEALTH_RULES_TEXT = [
  'rojo: pago vencido o fallido · 3+ rechazos en 30 días · cuenta paga sin publicar hace 14+ días · publicación fallida en 7 días · semana de cliente pago no generada a tiempo',
  'amarillo: aprobación menor a 65% (con 3+ decisiones) · 3+ ediciones en 30 días · sin actividad hace 5+ días · semana actual sin posteos · costo de IA del mes sobre el umbral',
  'la causa dominante elige la jugada: comercial → aviso de pago amable · culpa nuestra → compensación con pieza extra · calidad → revisión reforzada · sin material → semana 100% IA · desconexión → un toque con valor (máx. 1 por semana)',
  'prohibido: descuentos automáticos por estar en rojo · más de un toque extra semanal',
  `costo de IA sano: hasta ${AI_COST_CAP_PCT}% del precio del plan por mes; la alerta salta a los ${AI_COST_ALERT_PCT}%`,
];
function currentWeekKey() {
  // week_key del producto: ver weekKeyFor() en server.js (YYYY-MM-DD del lunes).
  const d = new Date(); const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}
function accountHealth(db, u, opts) {
  opts = opts || {};
  const sig = accountSignals(db, u.id, 30);
  const reasons = [];
  let lastAct = null, lastPubDays = null, weekPosts = 0, failed7 = 0, payFailed = 0, costAlert = false;
  try { const r = db.prepare('SELECT MAX(created_at) AS m FROM events WHERE user_id = ?').get(u.id); lastAct = r && r.m; } catch (e) {}
  try { const r = db.prepare("SELECT MAX(published_at) AS m FROM posts WHERE user_id = ? AND status = 'published'").get(u.id); if (r && r.m) lastPubDays = Math.floor((Date.now() - new Date(r.m.replace(' ', 'T') + 'Z').getTime()) / 864e5); } catch (e) {}
  try { weekPosts = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ?').get(u.id, currentWeekKey()).n || 0; } catch (e) {}
  try { failed7 = db.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND name = 'post_failed' AND datetime(created_at) >= datetime('now', '-7 days')").get(u.id).n || 0; } catch (e) {}
  try { payFailed = db.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND name = 'payment_failed' AND datetime(created_at) >= datetime('now', '-30 days')").get(u.id).n || 0; } catch (e) {}
  if (opts.monthSpendUsd != null && opts.planPriceUsd) costAlert = opts.monthSpendUsd >= opts.planPriceUsd * AI_COST_ALERT_PCT / 100;
  const ageH = (Date.now() - new Date(String(u.created_at || '').replace(' ', 'T') + 'Z').getTime()) / 36e5;
  const actDays = lastAct ? Math.floor((Date.now() - new Date(lastAct.replace(' ', 'T') + 'Z').getTime()) / 864e5) : null;
  const paid = u.plan_status === 'active';
  const weekday = new Date().getUTCDay(); // 0 dom .. 6 sáb
  const weekLate = paid && weekPosts === 0 && weekday >= 3; // miércoles o después, sin semana
  // Causas candidatas con peso (la dominante manda la jugada)
  const causes = [];
  if (u.plan_status === 'past_due' || payFailed > 0) causes.push({ cause: 'comercial', weight: 100, why: u.plan_status === 'past_due' ? 'suscripción vencida (past_due)' : `${payFailed} pago(s) fallido(s) en 30 días` });
  if (failed7 > 0 || weekLate) causes.push({ cause: 'culpa_nuestra', weight: 90, why: failed7 > 0 ? `${failed7} publicación(es) fallida(s) en 7 días` : 'semana de cliente pago no generada a tiempo' });
  if (sig.rejected + sig.rating_low >= 2 || (sig.approval_rate != null && sig.approval_rate < 50 && sig.decided >= 4) || sig.edits >= 5)
    causes.push({ cause: 'calidad', weight: 80, why: `${sig.rejected + sig.rating_low} rechazo(s) y ${sig.edits} ediciones en 30 días (aprobación ${sig.approval_rate == null ? '—' : sig.approval_rate + '%'})` });
  // sin material: subía fotos (misiones con fotos en semanas previas) y esta semana, cero
  try {
    const prev = db.prepare("SELECT COUNT(*) AS n FROM photo_missions WHERE user_id = ? AND week_key < ? AND shots != '[]' AND shots != ''").get(u.id, currentWeekKey());
    const cur = db.prepare('SELECT shots FROM photo_missions WHERE user_id = ? AND week_key = ?').get(u.id, currentWeekKey());
    const curShots = cur ? (JSON.parse(cur.shots || '[]') || []).length : 0;
    if (prev && prev.n >= 1 && curShots === 0 && paid) causes.push({ cause: 'sin_material', weight: 60, why: 'subía fotos y esta semana no subió ninguna' });
  } catch (e) {}
  if (actDays != null && actDays >= 7) causes.push({ cause: 'desconexion', weight: 50, why: `sin actividad hace ${actDays} días` });
  causes.sort((a, b) => b.weight - a.weight);
  const dominant = causes[0] || null;
  let level = 'verde';
  if (ageH < 48 && sig.posts.total === 0 && !paid) level = 'nuevo';
  else if (u.plan_status === 'past_due' || sig.rejected + sig.rating_low >= 3 || (paid && lastPubDays != null && lastPubDays >= 14) || failed7 > 0 || weekLate) level = 'rojo';
  else if ((sig.approval_rate != null && sig.approval_rate < 65 && sig.decided >= 3) || sig.edits >= 3 || (actDays != null && actDays >= 5) || weekPosts === 0 || costAlert) level = 'amarillo';
  if (level === 'rojo' && dominant) reasons.push(dominant.why);
  if (level === 'amarillo') {
    if (sig.approval_rate != null && sig.approval_rate < 65 && sig.decided >= 3) reasons.push(`aprobación ${sig.approval_rate}% en 30 días`);
    if (sig.edits >= 3) reasons.push(`${sig.edits} ediciones pedidas en 30 días`);
    if (actDays != null && actDays >= 5) reasons.push(`sin actividad hace ${actDays} días`);
    if (weekPosts === 0) reasons.push('semana actual sin posteos');
    if (costAlert) reasons.push(`costo de IA del mes sobre el umbral sano (${AI_COST_ALERT_PCT}% del plan)`);
  }
  if (level === 'verde') reasons.push('aprobación y actividad sanas, semana en curso con posteos');
  if (level === 'nuevo') reasons.push('cuenta nueva (menos de 48 h), todavía sin posteos');
  // Atención para ordenar la vista de posteos: lo que necesita ojos, primero.
  const attention = (sig.rejected + sig.rating_low) * 3 + sig.posts.needs_review * 2 + sig.posts.sin_ancla * 2 + sig.posts.img_redos + (level === 'rojo' ? 10 : level === 'amarillo' ? 4 : 0);
  return { level, reasons, cause: dominant ? dominant.cause : null, cause_why: dominant ? dominant.why : null,
    play: dominant && level !== 'verde' && level !== 'nuevo' ? PLAYS[dominant.cause] : null,
    signals: sig, last_activity: lastAct, days_since_activity: actDays, last_published_days: lastPubDays,
    week_posts: weekPosts, failed_7d: failed7, attention };
}

// ---------- Intervenciones rojo→verde: registro y medición ----------
// Cada rojo con causa registra UNA intervención abierta (dedup: misma cuenta +
// misma causa dentro de 7 días no duplica). Cuando la cuenta sale de rojo, la
// intervención se cierra con los días que tardó: así se mide el rescate por causa.
function ensureInterventionsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS health_interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'abierta',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT, days_to_resolve REAL
  )`);
}
function syncInterventions(db, healthByUser) {
  ensureInterventionsTable(db);
  const ins = db.prepare('INSERT INTO health_interventions (user_id, cause, play) VALUES (?, ?, ?)');
  const open = db.prepare("SELECT * FROM health_interventions WHERE status = 'abierta'");
  const close = db.prepare("UPDATE health_interventions SET status = 'resuelta', resolved_at = datetime('now'), days_to_resolve = (julianday('now') - julianday(created_at)) WHERE id = ?");
  const openRows = open.all();
  const openByUser = {};
  for (const r of openRows) { (openByUser[r.user_id] = openByUser[r.user_id] || []).push(r); }
  for (const [uidS, h] of Object.entries(healthByUser)) {
    const uid = Number(uidS);
    const mine = openByUser[uid] || [];
    if (h.level === 'rojo' && h.cause && h.play) {
      const recent = mine.find(r => r.cause === h.cause && (Date.now() - new Date(r.created_at.replace(' ', 'T') + 'Z').getTime()) < 7 * 864e5);
      if (!recent && !mine.find(r => r.cause === h.cause)) ins.run(uid, h.cause, h.play.play);
      // escalación: rojo sostenido 14+ días con intervención abierta = decisión del fundador
      const oldest = mine.concat(recent ? [recent] : []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
      if (oldest) h.founder_decision = (Date.now() - new Date(oldest.created_at.replace(' ', 'T') + 'Z').getTime()) >= 14 * 864e5;
    } else if (h.level !== 'rojo') {
      for (const r of mine) close.run(r.id);
    }
  }
  return open.all();
}
function rescueStats(db) {
  ensureInterventionsTable(db);
  const rows = db.prepare(`SELECT cause, COUNT(*) AS total,
      SUM(CASE WHEN status = 'resuelta' THEN 1 ELSE 0 END) AS resueltas,
      AVG(CASE WHEN status = 'resuelta' THEN days_to_resolve END) AS avg_days
    FROM health_interventions GROUP BY cause`).all();
  return rows.map(r => ({ cause: r.cause, play: (PLAYS[r.cause] || {}).play || '', total: r.total, resueltas: r.resueltas || 0,
    abiertas: r.total - (r.resueltas || 0), rescate_pct: r.total ? r1((r.resueltas || 0) / r.total * 100) : 0,
    avg_days: r.avg_days != null ? r1(r.avg_days) : null }));
}

// ---------- 8) CALIDAD DE POSTEOS + (A) TAXONOMÍA DE RECHAZOS ----------
// DEFINICIONES (declaradas, sin maquillaje):
//  pieza "a la primera" = sin versiones de caption, sin img_redos, sin
//    needs_review y con ancla de pertenencia (digest_hash sin ':sin-ancla').
//  TAXONOMÍA (A) — cada señal negativa del cliente (edited/rejected/rating bajo)
//    se clasifica por causa con estas reglas, en orden:
//    1. el posteo tiene versiones de caption → 'texto'
//    2. el posteo tiene img_redos > 0 → 'foto'
//    3. rechazada sin edición ni regeneración → 'idea' (la pieza no le gustó tal cual)
//    4. existe evento de reprogramación del posteo → 'horario'
//    5. si nada alcanza para inferir → 'sin_clasificar' (honesto, no se adivina)
const REJECT_CAUSES = ['foto', 'texto', 'idea', 'horario', 'otro', 'sin_clasificar'];
function classifyRejections(db, fromSql, toSql) {
  const byCause = {}; for (const c of REJECT_CAUSES) byCause[c] = 0;
  const byAccount = {};
  try {
    const rows = db.prepare(`SELECT s.user_id, s.post_id, s.client_signal,
        (SELECT COUNT(*) FROM post_versions v WHERE v.post_id = s.post_id) AS versions,
        (SELECT COALESCE(img_redos, 0) FROM posts p WHERE p.id = s.post_id) AS redos
      FROM post_signals s
      WHERE COALESCE(s.auto_signal, 0) = 0 AND s.client_signal IN ('edited', 'rejected', 'rating_1', 'rating_2')
        AND datetime(s.updated_at) >= datetime(?) AND datetime(s.updated_at) < datetime(?)`).all(fromSql, toSql);
    for (const r of rows) {
      let cause = 'sin_clasificar';
      if (r.versions > 0) cause = 'texto';
      else if (r.redos > 0) cause = 'foto';
      else if (r.client_signal === 'rejected') cause = 'idea';
      byCause[cause]++;
      if (!byAccount[r.user_id]) byAccount[r.user_id] = { total: 0 };
      byAccount[r.user_id].total++;
      byAccount[r.user_id][cause] = (byAccount[r.user_id][cause] || 0) + 1;
    }
  } catch (e) {}
  return { by_cause: byCause, by_account: byAccount,
    improve_first: Object.entries(byCause).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([cause, n]) => ({ cause, n })),
    rules: ['versiones de caption → texto', 'img_redos > 0 → foto', 'rechazo sin edición ni regeneración → idea', 'reprogramación registrada → horario', 'sin señal suficiente → sin clasificar (no se adivina)'] };
}
function qualityMetrics(db, fromSql, toSql) {
  const out = { total: 0, first_pass: 0, first_pass_pct: null, regenerated: 0, with_versions: 0,
    sin_ancla: 0, needs_review: 0, edits_per_account_week: null, trend: null, taxonomy: null };
  try {
    const rows = db.prepare(`SELECT p.user_id,
        (SELECT COUNT(*) FROM post_versions v WHERE v.post_id = p.id) AS versions,
        COALESCE(p.img_redos, 0) AS redos, COALESCE(p.needs_review, 0) AS nr, p.digest_hash
      FROM posts p WHERE datetime(p.created_at) >= datetime(?) AND datetime(p.created_at) < datetime(?)`).all(fromSql, toSql);
    let fp = 0;
    const perUser = {};
    for (const r of rows) {
      out.total++;
      const touched = r.versions > 0 || r.redos > 0 || r.nr > 0 || String(r.digest_hash || '').endsWith(':sin-ancla');
      if (!touched) fp++;
      if (r.redos > 0) out.regenerated++;
      if (r.versions > 0) out.with_versions++;
      if (r.nr > 0) out.needs_review++;
      if (String(r.digest_hash || '').endsWith(':sin-ancla')) out.sin_ancla++;
      perUser[r.user_id] = (perUser[r.user_id] || 0) + r.versions;
    }
    out.first_pass = fp;
    out.first_pass_pct = out.total ? r1(fp / out.total * 100) : null;
    const weeks = Math.max(1, Math.round((new Date(toSql) - new Date(fromSql)) / (7 * 864e5)));
    const accounts = Object.keys(perUser).length;
    const totalVersions = Object.values(perUser).reduce((s, n) => s + n, 0);
    out.edits_per_account_week = accounts ? r2(totalVersions / accounts / weeks) : null;
    // tendencia: primera mitad vs segunda mitad del período (first-pass %)
    const mid = new Date((new Date(fromSql).getTime() + new Date(toSql).getTime()) / 2).toISOString().slice(0, 19).replace('T', ' ');
    const half = (a, b) => {
      const rr = db.prepare(`SELECT COUNT(*) AS n,
          SUM(CASE WHEN COALESCE(img_redos,0)=0 AND COALESCE(needs_review,0)=0 AND COALESCE(digest_hash,'') NOT LIKE '%:sin-ancla'
            AND NOT EXISTS (SELECT 1 FROM post_versions v WHERE v.post_id = posts.id) THEN 1 ELSE 0 END) AS fp
        FROM posts WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`).get(a, b);
      return rr && rr.n ? r1((rr.fp || 0) / rr.n * 100) : null;
    };
    out.trend = { first_half_pct: half(fromSql, mid), second_half_pct: half(mid, toSql) };
  } catch (e) {}
  out.taxonomy = classifyRejections(db, fromSql, toSql);
  return out;
}

// ---------- 2) PLATA: costo por cuenta, margen por plan y por rubro, LTV (D) ----------
// EL DINERO NO SE RESETEA: api_costs se suma SIEMPRE completo para los acumulados;
// el "costo del período" es una ventana de lectura, no un borrado ni un corte del ledger.
function planPriceFor(opts, u) {
  // opts.priceFor(user) lo inyecta server.js (conoce planes, fundador y rail de pago).
  try { return opts.priceFor(u) || null; } catch (e) { return null; }
}
function moneyBoard(db, opts, fromSql, toSql) {
  const out = { accounts: [], by_plan: [], by_rubro: [], totals: { cost_period_usd: 0, cost_all_time_usd: 0, revenue_period_usd: null, margin_period_usd: null }, ltv: null, cac: null, fx_note: '' };
  let costsPeriod = {}, costsAll = {};
  try { for (const r of db.prepare(`SELECT user_id, SUM(est_cost_usd) AS s FROM api_costs WHERE datetime(ts) >= datetime(?) AND datetime(ts) < datetime(?) GROUP BY user_id`).all(fromSql, toSql)) costsPeriod[r.user_id] = r2(r.s); } catch (e) {}
  try { for (const r of db.prepare('SELECT user_id, SUM(est_cost_usd) AS s FROM api_costs GROUP BY user_id').all()) costsAll[r.user_id] = r2(r.s); } catch (e) {}
  try { const t = db.prepare('SELECT COALESCE(SUM(est_cost_usd), 0) AS s FROM api_costs').get(); out.totals.cost_all_time_usd = r2(t.s); } catch (e) {}
  out.totals.cost_period_usd = r2(Object.values(costsPeriod).reduce((s, n) => s + n, 0));
  let users = [];
  try { users = db.prepare(`SELECT u.*, pr.category AS rubro FROM users u LEFT JOIN profiles pr ON pr.user_id = u.id`).all(); } catch (e) {}
  const byPlan = {}, byRubro = {};
  let revenue = 0, revenueKnown = false;
  for (const u of users) {
    const cp = costsPeriod[u.id] || 0, ca = costsAll[u.id] || 0;
    const price = planPriceFor(opts, u); // {amount, currency, usd} | null
    if (u.plan_status === 'active' || cp > 0 || ca > 0) {
      out.accounts.push({ user_id: u.id, email: u.email, plan: u.plan, plan_status: u.plan_status, rubro: u.rubro || '',
        cost_period_usd: cp, cost_all_time_usd: ca,
        price: price ? { amount: price.amount, currency: price.currency } : null,
        margin_period_usd: (u.plan_status === 'active' && price && price.usd != null) ? r2(price.usd - cp) : null });
    }
    if (u.plan_status === 'active') {
      const pk = u.plan || 'trial';
      byPlan[pk] = byPlan[pk] || { plan: pk, subs: 0, revenue_usd: 0, cost_usd: 0, revenue_known: false };
      byPlan[pk].subs++; byPlan[pk].cost_usd = r2(byPlan[pk].cost_usd + cp);
      if (price && price.usd != null) { byPlan[pk].revenue_usd = r2(byPlan[pk].revenue_usd + price.usd); byPlan[pk].revenue_known = true; revenue += price.usd; revenueKnown = true; }
      const rk = u.rubro || '(sin rubro)';
      byRubro[rk] = byRubro[rk] || { rubro: rk, subs: 0, revenue_usd: 0, cost_usd: 0, revenue_known: false };
      byRubro[rk].subs++; byRubro[rk].cost_usd = r2(byRubro[rk].cost_usd + cp);
      if (price && price.usd != null) { byRubro[rk].revenue_usd = r2(byRubro[rk].revenue_usd + price.usd); byRubro[rk].revenue_known = true; }
    }
  }
  out.accounts.sort((a, b) => b.cost_period_usd - a.cost_period_usd);
  out.by_plan = Object.values(byPlan).map(p => ({ ...p, margin_usd: p.revenue_known ? r2(p.revenue_usd - p.cost_usd) : null }));
  out.by_rubro = Object.values(byRubro).map(p => ({ ...p, margin_usd: p.revenue_known ? r2(p.revenue_usd - p.cost_usd) : null }));
  if (revenueKnown) { out.totals.revenue_period_usd = r2(revenue); out.totals.margin_period_usd = r2(revenue - out.totals.cost_period_usd); }
  // LTV simple (D): precio promedio del que paga × meses retenidos promedio REAL
  // (alta → hoy si sigue activo, alta → baja si canceló; solo cuentas que pagaron).
  try {
    const payers = users.filter(u => u.founder_price != null || u.plan_status === 'active' || u.plan_status === 'cancelled');
    const everPaid = db.prepare("SELECT DISTINCT user_id FROM events WHERE name = 'payment_ok' AND user_id IS NOT NULL").all().map(r => r.user_id);
    const set = new Set(everPaid);
    const rows = users.filter(u => set.has(u.id));
    if (rows.length) {
      let months = 0, prices = 0, pn = 0;
      for (const u of rows) {
        const start = new Date(String(u.created_at).replace(' ', 'T') + 'Z').getTime();
        months += Math.max(0.1, (Date.now() - start) / (30.44 * 864e5));
        const p = planPriceFor(opts, u);
        if (p && p.usd != null) { prices += p.usd; pn++; }
      }
      const avgMonths = months / rows.length, avgPrice = pn ? prices / pn : null;
      out.ltv = { payers: rows.length, avg_months_retained: r1(avgMonths), avg_price_usd: avgPrice != null ? r2(avgPrice) : null,
        ltv_usd: avgPrice != null ? r2(avgPrice * avgMonths) : null,
        basis: 'precio actual del plan × meses desde el alta de las cuentas que pagaron alguna vez (payment_ok)' };
    }
  } catch (e) {}
  // CAC (D): solo con gasto cargado en ad_spend. Por canal: 'sin dato' hasta que el
  // gasto se cargue por canal (ad_spend guarda campaña, no canal) — jamás 0 disfrazado.
  try {
    const spend = db.prepare(`SELECT COALESCE(SUM(amount_usd), 0) AS s, COUNT(*) AS n FROM ad_spend WHERE date >= date(?) AND date < date(?)`).get(fromSql.slice(0, 10), toSql.slice(0, 10));
    const paidN = funnelUniques(db, 'payment_ok', fromSql, toSql).size;
    if (spend && spend.n > 0 && spend.s > 0) out.cac = { spend_usd: r2(spend.s), payments: paidN, cac_usd: paidN ? r2(spend.s / paidN) : null, by_channel: null, by_channel_note: 'sin dato: el gasto se carga por campaña, no por canal' };
    else out.cac = { spend_usd: 0, payments: paidN, cac_usd: null, by_channel: null, by_channel_note: 'sin dato: no hay gasto publicitario cargado en el período' };
  } catch (e) { out.cac = { cac_usd: null, by_channel: null, by_channel_note: 'sin dato: tabla ad_spend no disponible' }; }
  out.fx_note = 'ingresos convertidos a USD con los tipos de cambio configurados en el servidor (ARS/USD y UYU/USD); sin tipo de cambio, el margen de esa moneda queda null y se declara';
  return out;
}

// ---------- Cohortes semanales (pieza 2) ----------
function cohorts(db, fromSql, toSql) {
  const out = [];
  try {
    const users = db.prepare(`SELECT id, created_at, plan_status FROM users
      WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`).all(fromSql, toSql);
    const paidUsers = new Set(db.prepare("SELECT DISTINCT user_id FROM events WHERE name = 'payment_ok' AND user_id IS NOT NULL").all().map(r => r.user_id));
    const activeLately = new Set(db.prepare("SELECT DISTINCT user_id FROM events WHERE user_id IS NOT NULL AND datetime(created_at) >= datetime('now', '-7 days')").all().map(r => r.user_id));
    let spend = {};
    try { for (const r of db.prepare('SELECT user_id, SUM(est_cost_usd) AS s FROM api_costs GROUP BY user_id').all()) spend[r.user_id] = r.s; } catch (e) {}
    const byWeek = {};
    for (const u of users) {
      const wk = mondayOf(u.created_at); if (!wk) continue;
      byWeek[wk] = byWeek[wk] || { week: wk, signups: 0, paid: 0, retained: 0, ai_cost_usd: 0, mature: false };
      byWeek[wk].signups++;
      if (paidUsers.has(u.id)) byWeek[wk].paid++;
      if (activeLately.has(u.id) || u.plan_status === 'active') byWeek[wk].retained++;
      byWeek[wk].ai_cost_usd += spend[u.id] || 0;
    }
    for (const c of Object.values(byWeek)) {
      c.conversion_pct = c.signups ? r1(c.paid / c.signups * 100) : 0;
      // retención solo se declara para cohortes con 7+ días de vida; si no, null (no se estima)
      c.mature = (Date.now() - new Date(c.week + 'T12:00:00Z').getTime()) >= 7 * 864e5;
      c.retention_pct = c.mature ? r1(c.retained / c.signups * 100) : null;
      c.ai_cost_usd = r2(c.ai_cost_usd);
      delete c.retained;
    }
    out.push(...Object.values(byWeek).sort((a, b) => String(b.week).localeCompare(String(a.week))));
  } catch (e) {}
  return out;
}

// ---------- 6) ALERTAS AUTOMÁTICAS ----------
// Canal real: la superficie admin (este payload alimenta el tablero y, con su
// forma {sev,text}, el banner de alertas que el admin ya muestra desde
// /api/admin/growth). DEDUP por construcción: cada alerta tiene una clave
// determinística (tipo + cuenta + período); el mismo hecho recomputado da la
// misma clave y la UI marca vistas en el navegador — el hecho repetido se
// AGREGA en un conteo, nunca se multiplica en avisos.
function computeAlerts(db, opts) {
  opts = opts || {};
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  const bizName = (uid) => {
    try { const r = db.prepare('SELECT business_name FROM profiles WHERE user_id = ?').get(uid); if (r && r.business_name) return r.business_name; } catch (e) {}
    try { const r = db.prepare('SELECT email FROM users WHERE id = ?').get(uid); return (r && r.email) || ('usuario ' + uid); } catch (e) { return 'usuario ' + uid; }
  };
  // (a) pago entrante: altas y renovaciones llegan como payment_ok
  try {
    const rows = db.prepare("SELECT user_id, created_at FROM events WHERE name = 'payment_ok' AND datetime(created_at) >= datetime('now', '-24 hours') ORDER BY created_at DESC").all();
    if (rows.length) out.push({ key: 'payment:' + today, type: 'payment', sev: 'ok',
      title: `🎉 ${rows.length} pago(s) cobrado(s) en 24 h`, detail: rows.map(r => bizName(r.user_id)).slice(0, 8).join(' · '), count: rows.length, at: rows[0].created_at });
    const fails = db.prepare("SELECT user_id, COUNT(*) AS n FROM events WHERE name = 'payment_failed' AND datetime(created_at) >= datetime('now', '-24 hours') GROUP BY user_id").all();
    for (const f of fails) out.push({ key: `payfail:${f.user_id}:${today}`, type: 'payment_failed', sev: 'high',
      title: `⚠️ Pago fallido: ${bizName(f.user_id)}`, detail: `${f.n} intento(s) fallido(s) en 24 h — entra la jugada comercial (aviso amable con link de un toque)`, count: f.n });
  } catch (e) {}
  // (b) posteo que falló al publicar (agregado por cuenta)
  try {
    const rows = db.prepare("SELECT user_id, COUNT(*) AS n, MAX(created_at) AS last FROM events WHERE name = 'post_failed' AND datetime(created_at) >= datetime('now', '-24 hours') GROUP BY user_id ORDER BY n DESC").all();
    for (const f of rows) out.push({ key: `postfail:${f.user_id}:${today}`, type: 'post_failed', sev: 'high',
      title: `❌ Publicación fallida: ${bizName(f.user_id)}`, detail: `${f.n} fallo(s) en 24 h — entra la jugada de culpa nuestra (prioridad de regeneración + pieza extra)`, count: f.n, at: f.last });
  } catch (e) {}
  // (c) semana de cliente pago no generada a tiempo (miércoles en adelante, semana vacía)
  try {
    const weekday = new Date().getUTCDay();
    if (weekday >= 3) {
      const paid = db.prepare("SELECT id FROM users WHERE plan_status = 'active'").all();
      for (const u of paid) {
        const n = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ?').get(u.id, currentWeekKey()).n || 0;
        if (!n) out.push({ key: `weeklate:${u.id}:${currentWeekKey()}`, type: 'week_late', sev: 'high',
          title: `⏰ Semana sin generar: ${bizName(u.id)}`, detail: 'cliente pago y la semana actual no tiene posteos — entra la jugada de culpa nuestra', count: 1 });
      }
    }
  } catch (e) {}
  // (d) costo de IA sobre el umbral sano del plan (8% alerta · 10% tope del producto)
  try {
    if (opts.costCtx) {
      const actives = db.prepare("SELECT * FROM users WHERE plan_status = 'active'").all();
      for (const u of actives) {
        const ctx = opts.costCtx(u);
        if (ctx && ctx.planPriceUsd && ctx.monthSpendUsd >= ctx.planPriceUsd * AI_COST_ALERT_PCT / 100) {
          out.push({ key: `cost:${u.id}:${today.slice(0, 7)}`, type: 'ai_cost', sev: 'med',
            title: `💸 Costo de IA alto: ${bizName(u.id)}`, detail: `US$ ${r2(ctx.monthSpendUsd)} este mes = ${Math.round(ctx.monthSpendUsd / ctx.planPriceUsd * 100)}% del precio de su plan (alerta ${AI_COST_ALERT_PCT}% · tope ${AI_COST_CAP_PCT}%)`, count: 1 });
        }
      }
    }
  } catch (e) {}
  return out;
}

// ---------- (C) RUMBO A LOS 200 ----------
// Proyección SOLO con altas y conversión reales del período (respetando la
// época). Fail-closed: sin ritmo positivo o sin ventana suficiente, se declara
// 'sin_datos' con el motivo — jamás una fecha de humo.
function projection200(db, opts, era) {
  const payers = (() => { try { return db.prepare("SELECT COUNT(*) AS n FROM users WHERE plan_status = 'active'").get().n || 0; } catch (e) { return 0; } })();
  const base = { goal: 200, payers, remaining: Math.max(0, 200 - payers), pct: r1(payers / 200 * 100) };
  if (era === 'launch' && Date.now() < launchEpochMs())
    return { ...base, status: 'sin_datos', reason: 'la época de lanzamiento todavía no empezó: no hay ritmo de lanzamiento que proyectar (la era de prueba no se usa para proyectar)' };
  const fromSql = era === 'launch' ? epochSql() : '1970-01-01 00:00:00';
  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const winStart = new Date(Math.max(new Date(fromSql.replace(' ', 'T') + 'Z').getTime(), Date.now() - 28 * 864e5)).toISOString().slice(0, 19).replace('T', ' ');
  const weeks = Math.max(0.5, (Date.now() - new Date(winStart.replace(' ', 'T') + 'Z').getTime()) / (7 * 864e5));
  let signups = 0, paidOfWindow = 0;
  try {
    signups = db.prepare('SELECT COUNT(*) AS n FROM users WHERE datetime(created_at) >= datetime(?)').get(winStart).n || 0;
    paidOfWindow = db.prepare(`SELECT COUNT(*) AS n FROM users u WHERE datetime(u.created_at) >= datetime(?)
      AND EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id AND e.name = 'payment_ok')`).get(winStart).n || 0;
  } catch (e) {}
  const signupsPerWeek = signups / weeks;
  const conv = signups ? paidOfWindow / signups : 0;
  const addsPerWeek = signupsPerWeek * conv;
  if (!(addsPerWeek > 0) || signups < 3)
    return { ...base, status: 'sin_datos', reason: `ritmo insuficiente para proyectar: ${signups} alta(s) y ${paidOfWindow} pago(s) en la ventana de ${r1(weeks)} semanas`, window_weeks: r1(weeks), signups_per_week: r1(signupsPerWeek), conversion_pct: r1(conv * 100) };
  const etaWeeks = (200 - payers) / addsPerWeek;
  const eta = new Date(Date.now() + etaWeeks * 7 * 864e5);
  const scenario = (volMult, convMult) => {
    const a = signupsPerWeek * volMult * Math.min(1, conv * convMult);
    return a > 0 ? Math.ceil((200 - payers) / a) : null;
  };
  const baseWeeks = Math.ceil(etaWeeks);
  const volWeeks = scenario(1.5, 1), convWeeks = scenario(1, 1.5);
  const lever = (volWeeks != null && convWeeks != null)
    ? (convWeeks < volWeeks ? { lever: 'conversion', label: `mejorar la conversión prueba→pago adelanta más que sumar volumen: con +50% de conversión se llega en ${convWeeks} semanas contra ${volWeeks} con +50% de volumen` }
      : { lever: 'volumen', label: `sumar volumen de pruebas adelanta más: con +50% de pruebas se llega en ${volWeeks} semanas contra ${convWeeks} con +50% de conversión` })
    : null;
  return { ...base, status: 'ok', window_weeks: r1(weeks), signups_per_week: r1(signupsPerWeek),
    conversion_pct: r1(conv * 100), adds_per_week: r2(addsPerWeek), weeks_to_goal: baseWeeks,
    eta_date: eta.toISOString().slice(0, 10), lever,
    basis: `a este ritmo (${r1(signupsPerWeek)} altas/semana × ${r1(conv * 100)}% de conversión, ventana ${era === 'launch' ? 'desde la época' : 'completa'}): semana del ${eta.toISOString().slice(0, 10)}` };
}

// ---------- (B) AUTOPSIA DE BAJAS ----------
// Al cancelarse una cuenta queda su foto final PERMANENTE: señales de las
// últimas 4 semanas, causa dominante, intervenciones hechas y su resultado.
// El barrido captura a las ya canceladas sin foto (basis declarada); las bajas
// nuevas se capturan en el primer barrido posterior a la cancelación.
function ensureAutopsyTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS churn_autopsies (
    user_id INTEGER PRIMARY KEY, captured_at TEXT NOT NULL DEFAULT (datetime('now')),
    basis TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL DEFAULT '{}'
  )`);
}
function snapshotAutopsy(db, uid, opts, basis) {
  ensureAutopsyTable(db);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!u) return null;
  const health = accountHealth(db, u, (opts && opts.costCtx) ? opts.costCtx(u) : {});
  let interventions = [];
  try { ensureInterventionsTable(db); interventions = db.prepare('SELECT cause, play, status, created_at, resolved_at, days_to_resolve FROM health_interventions WHERE user_id = ? ORDER BY created_at').all(uid); } catch (e) {}
  const snap = { email: u.email, plan: u.plan, signals_28d: accountSignals(db, uid, 28),
    dominant_cause: health.cause, health_reasons: health.reasons, interventions };
  db.prepare('INSERT OR REPLACE INTO churn_autopsies (user_id, basis, snapshot) VALUES (?, ?, ?)').run(uid, basis || 'capturada al cancelarse', JSON.stringify(snap));
  return snap;
}
function sweepAutopsies(db, opts) {
  ensureAutopsyTable(db);
  let made = 0;
  try {
    const rows = db.prepare(`SELECT u.id FROM users u WHERE u.plan_status = 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM churn_autopsies a WHERE a.user_id = u.id)`).all();
    for (const r of rows) { snapshotAutopsy(db, r.id, opts, 'capturada por barrido: la cuenta ya estaba cancelada'); made++; }
  } catch (e) {}
  return made;
}
function autopsyPatterns(db) {
  ensureAutopsyTable(db);
  const rows = db.prepare('SELECT snapshot FROM churn_autopsies').all();
  if (!rows.length) return { n: 0, note: 'sin bajas reales todavía: no hay foto final que aprender (nada inventado)' };
  const causes = {}; let withIntervention = 0, lowApproval = 0;
  for (const r of rows) {
    const s = parseProps(r.snapshot);
    if (s.dominant_cause) causes[s.dominant_cause] = (causes[s.dominant_cause] || 0) + 1;
    if (s.interventions && s.interventions.length) withIntervention++;
    if (s.signals_28d && s.signals_28d.approval_rate != null && s.signals_28d.approval_rate < 65) lowApproval++;
  }
  return { n: rows.length, dominant_causes: causes, with_prior_intervention: withIntervention,
    low_approval_before_churn: lowApproval,
    note: 'patrones previos a la baja, agregados de las fotos finales guardadas al cancelarse cada cuenta' };
}

// ---------- (E) LOOP DE APRENDIZAJE: estructura + ingesta fail-closed ----------
// SOLO estructura de datos e ingesta. Ninguna UI promete datos que hoy no
// existen, la radiografía y la generación NO cambian en esta tanda, y que
// Posty ACTÚE sobre lo aprendido es decisión de producto aparte.
//  piece_learning: rendimiento de IG por posteo (de post_metrics, que se llena
//    con el veredicto de Meta) cruzado con las variables de nacimiento del posteo.
//  account_experiments: memoria de experimentos por cuenta (hipótesis → resultado).
function ensureLearningTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS piece_learning (
    post_id INTEGER PRIMARY KEY, user_id INTEGER, week_key TEXT DEFAULT '',
    intent TEXT DEFAULT '', angle TEXT DEFAULT '', style_code TEXT DEFAULT '', template TEXT DEFAULT '',
    format TEXT DEFAULT '', hour TEXT DEFAULT '',
    reach INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS account_experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, week_key TEXT DEFAULT '',
    hypothesis TEXT NOT NULL DEFAULT '', result TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}
function syncLearning(db) {
  ensureLearningTables(db);
  let hasMetrics = false, rows = 0;
  try { hasMetrics = !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'post_metrics'").get(); } catch (e) {}
  if (!hasMetrics) return { rows: 0, status: 'sin_datos', note: 'post_metrics no existe: la ingesta espera las métricas de Instagram (veredicto de Meta)' };
  try {
    const data = db.prepare(`SELECT pm.post_id, p.user_id, p.week_key, p.tipo, p.media_type, p.scheduled_at,
        p.source_angle, COALESCE(sg.style_code, '') AS style_code, COALESCE(sg.template, '') AS template,
        pm.reach, pm.likes, pm.comments
      FROM post_metrics pm JOIN posts p ON p.id = pm.post_id
      LEFT JOIN post_signals sg ON sg.post_id = pm.post_id`).all();
    const up = db.prepare(`INSERT INTO piece_learning (post_id, user_id, week_key, intent, angle, style_code, template, format, hour, reach, likes, comments, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(post_id) DO UPDATE SET reach = excluded.reach, likes = excluded.likes, comments = excluded.comments, updated_at = datetime('now')`);
    for (const r of data) {
      up.run(r.post_id, r.user_id, r.week_key || '', r.tipo || '', r.source_angle || '', r.style_code || '', r.template || '',
        r.media_type || '', String(r.scheduled_at || '').slice(11, 16), r.reach, r.likes, r.comments);
      rows++;
    }
  } catch (e) { return { rows: 0, status: 'error', note: String(e.message || e) }; }
  if (!rows) return { rows: 0, status: 'sin_datos', note: 'post_metrics está vacío: todavía no hay rendimiento de Instagram que cruzar (se prende con el veredicto de Meta)' };
  return { rows, status: 'ok', note: 'rendimiento por pieza cruzado con intención/ángulo/estilo/formato/hora de nacimiento' };
}

// ---------- (F) DICCIONARIO DE EVENTOS ----------
// Registro único: cada evento con dueño y el número que alimenta. La copia
// gobernante vive en EVENT-DICTIONARY.md (repo); esta lista la espeja para que
// el admin marque lo no registrado como legado. Evento sin número = legado.
const EVENT_DICTIONARY = [
  { name: 'prueba_view', owner: 'funnel', feeds: 'tablero: visitas a la prueba' },
  { name: 'prueba_complete', owner: 'funnel', feeds: 'tablero: conversión del formulario' },
  { name: 'prueba_register', owner: 'funnel', feeds: 'tablero: registros desde la prueba' },
  { name: 'ig_connect', owner: 'producto', feeds: 'tablero: activación IG' },
  { name: 'week_generate_start', owner: 'generación', feeds: 'salud del sistema: tasa de generación' },
  { name: 'week_generate_done', owner: 'generación', feeds: 'tablero: semanas generadas · alerta semana atrasada' },
  { name: 'post_publish', owner: 'publicación', feeds: 'tablero: time-to-value' },
  { name: 'post_failed', owner: 'publicación', feeds: 'alertas: publicación fallida · termómetro (culpa nuestra)' },
  { name: 'payment_ok', owner: 'billing', feeds: 'tablero: pagos · alertas · rumbo a los 200' },
  { name: 'payment_failed', owner: 'billing', feeds: 'alertas: pago fallido · termómetro (comercial)' },
  { name: 'account_created', owner: 'auth', feeds: 'funnel legacy: registro' },
  { name: 'ref_click', owner: 'growth', feeds: 'referidos: clicks por código' },
  { name: 'schedule_all', owner: 'producto', feeds: 'funnel legacy: semana aceptada' },
];
function dictionaryAudit(db) {
  const known = new Set(EVENT_DICTIONARY.map(e => e.name));
  let present = [];
  try { present = db.prepare('SELECT name, COUNT(*) AS n FROM events GROUP BY name ORDER BY n DESC').all(); } catch (e) {}
  return { registered: EVENT_DICTIONARY,
    present: present.map(r => ({ name: r.name, n: r.n, registered: known.has(r.name), legacy: !known.has(r.name) })),
    unregistered: present.filter(r => !known.has(r.name)).map(r => r.name) };
}

// ---------- cuentas: overview + detalle de posteos (pieza 4) ----------
function bizOf(db, uid) {
  let b = { business_name: '', ig_username: '', category: '' };
  try { const r = db.prepare('SELECT business_name, ig_username, category FROM profiles WHERE user_id = ?').get(uid); if (r) b = r; } catch (e) {}
  return b;
}
function allUsers(db) {
  try { return db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 300').all(); } catch (e) { return []; }
}
function healthMap(db, opts) {
  const users = allUsers(db);
  const map = {};
  for (const u of users) {
    const ctx = (opts && opts.costCtx) ? (opts.costCtx(u) || {}) : {};
    map[u.id] = { user: u, health: accountHealth(db, u, ctx) };
  }
  const open = syncInterventions(db, Object.fromEntries(Object.entries(map).map(([id, v]) => [id, v.health])));
  return { users, map, openInterventions: open };
}
function accountsOverview(db, opts) {
  const { users, map } = healthMap(db, opts);
  const accounts = users.map(u => {
    const h = map[u.id].health, b = bizOf(db, u.id);
    return { user_id: u.id, email: u.email, business_name: b.business_name || '', ig_username: b.ig_username || '',
      plan: u.plan, plan_status: u.plan_status, created_at: u.created_at,
      health: h.level, reasons: h.reasons, cause: h.cause, cause_why: h.cause_why, play: h.play,
      founder_decision: !!h.founder_decision, attention: h.attention,
      signals: { approved: h.signals.approved, edited: h.signals.edits, rejected: h.signals.rejected + h.signals.rating_low,
        decided: h.signals.decided, approval_rate: h.signals.approval_rate },
      week_posts: h.week_posts, last_activity: h.last_activity };
  }).sort((a, b) => b.attention - a.attention);
  const byLevel = { rojo: 0, amarillo: 0, verde: 0, nuevo: 0 };
  for (const a of accounts) byLevel[a.health] = (byLevel[a.health] || 0) + 1;
  return { accounts, by_level: byLevel, rules: HEALTH_RULES_TEXT };
}
function accountPostsDetail(db, uid) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
  if (!u) return null;
  let posts = [];
  try {
    posts = db.prepare(`SELECT p.*, sg.client_signal AS signal,
        (SELECT COUNT(*) FROM post_versions v WHERE v.post_id = p.id) AS versions
      FROM posts p LEFT JOIN post_signals sg ON sg.post_id = p.id
      WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 200`).all(uid);
  } catch (e) {}
  const detail = posts.map(p => {
    const flags = [];
    if (p.signal === 'rejected' || p.signal === 'rating_1' || p.signal === 'rating_2') flags.push('rechazada');
    if ((p.img_redos || 0) > 0) flags.push('regenerada');
    if (p.versions > 0) flags.push('editada');
    if (String(p.digest_hash || '').endsWith(':sin-ancla')) flags.push('sin-ancla');
    if (p.needs_review) flags.push('gate');
    if (p.user_stopped) flags.push('frenada');
    if (p.status === 'failed') flags.push('fallida');
    return { id: p.id, media_type: p.media_type, tipo: p.tipo, status: p.status, approval: p.approval,
      signal: p.signal || null, caption: p.caption || '', hashtags: p.hashtags || '',
      scheduled_at: p.scheduled_at, published_at: p.published_at, created_at: p.created_at,
      week_key: p.week_key, ig_permalink: p.ig_permalink || '', error: p.error || '',
      why: p.strategy_why || '', img_redos: p.img_redos || 0, versions: p.versions || 0,
      image_url: p.image_path ? '/api/admin/post-image/' + p.id : null, flags, attention: flags.length > 0 };
  });
  let interventions = [];
  try { ensureInterventionsTable(db); interventions = db.prepare('SELECT * FROM health_interventions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(uid); } catch (e) {}
  return { user: { id: u.id, email: u.email, plan: u.plan, plan_status: u.plan_status, created_at: u.created_at, ...bizOf(db, uid) },
    signals: accountSignals(db, uid, 30), signals_28d_note: 'señales del cliente, últimos 30 días',
    posts: detail, interventions,
    review_note: 'vista de monitoreo: la aprobación se hace en la cola de Revisión, no acá' };
}

// ---------- PORTADA DE LA MAÑANA ----------
// La pantalla del ritual: atención → ayer → hoy → pulso. Sin filtros ni
// configuración: se lee completa en ~2 minutos. El "día" es el calendario de
// Argentina (UTC-3), la casa del producto; se declara en el payload.
function artDayBounds() {
  const sql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const art = new Date(Date.now() - 3 * 36e5);
  const startUtc = Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate()) + 3 * 36e5;
  return { label: 'día calendario America/Argentina/Buenos_Aires (UTC-3)',
    today: [sql(startUtc), sql(startUtc + 864e5)],
    yesterday: [sql(startUtc - 864e5), sql(startUtc)],
    day_before: [sql(startUtc - 2 * 864e5), sql(startUtc - 864e5)] };
}
function morning(db, opts, query) {
  const era = eraOf(query);
  const B = artDayBounds();
  const evCount = (name, w) => { try { return db.prepare('SELECT COUNT(*) AS n FROM events WHERE name = ? AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)').get(name, w[0], w[1]).n || 0; } catch (e) { return 0; } };
  const evUniques = (name, w) => funnelUniques(db, name, w[0], w[1]).size;
  // 1) atención
  const alerts = computeAlerts(db, opts);
  const { map } = healthMap(db, opts);
  const risk = Object.values(map).filter(v => v.health.level === 'rojo' || v.health.level === 'amarillo')
    .map(v => ({ user_id: v.user.id, business_name: bizOf(db, v.user.id).business_name || v.user.email,
      level: v.health.level, cause: v.health.cause, cause_why: v.health.cause_why,
      play: v.health.play ? v.health.play.play : null, founder_decision: !!v.health.founder_decision }))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'rojo' ? -1 : 1));
  const founderDecisions = risk.filter(r => r.founder_decision);
  // 2) lo que pasó desde ayer
  let payments = [], published = [], failed = [], registers = [];
  try { payments = db.prepare(`SELECT e.user_id, e.created_at FROM events e WHERE e.name = 'payment_ok' AND datetime(e.created_at) >= datetime(?) AND datetime(e.created_at) < datetime(?) ORDER BY e.created_at DESC`).all(B.yesterday[0], B.yesterday[1])
    .map(r => ({ user_id: r.user_id, business_name: bizOf(db, r.user_id).business_name || '', at: r.created_at })); } catch (e) {}
  try { published = db.prepare(`SELECT id, user_id, media_type, tipo, published_at FROM posts WHERE status = 'published' AND datetime(published_at) >= datetime(?) AND datetime(published_at) < datetime(?) ORDER BY published_at DESC LIMIT 60`).all(B.yesterday[0], B.yesterday[1])
    .map(r => ({ post_id: r.id, user_id: r.user_id, business_name: bizOf(db, r.user_id).business_name || '', media_type: r.media_type, tipo: r.tipo, at: r.published_at, image_url: '/api/admin/post-image/' + r.id })); } catch (e) {}
  try { failed = db.prepare(`SELECT user_id, props, created_at FROM events WHERE name = 'post_failed' AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) ORDER BY created_at DESC LIMIT 20`).all(B.yesterday[0], B.yesterday[1])
    .map(r => { const p = parseProps(r.props); return { user_id: r.user_id, business_name: bizOf(db, r.user_id).business_name || '', post_id: p.post_id || null, cause: String(p.cause || '').slice(0, 120), at: r.created_at }; }); } catch (e) {}
  try { registers = db.prepare(`SELECT id, email, created_at FROM users WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) ORDER BY created_at DESC`).all(B.yesterday[0], B.yesterday[1])
    .map(r => ({ user_id: r.id, email: r.email, business_name: bizOf(db, r.id).business_name || '', at: r.created_at })); } catch (e) {}
  const yCounts = { payments: payments.length, trials_started: evUniques('prueba_view', B.yesterday), trials_completed: evUniques('prueba_complete', B.yesterday),
    registers: registers.length, published: published.length, failed: failed.length, weeks_generated: evUniques('week_generate_done', B.yesterday) };
  const dCounts = { payments: evCount('payment_ok', B.day_before), trials_started: evUniques('prueba_view', B.day_before), trials_completed: evUniques('prueba_complete', B.day_before),
    registers: (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM users WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)').get(B.day_before[0], B.day_before[1]).n || 0; } catch (e) { return 0; } })(),
    published: (() => { try { return db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status = 'published' AND datetime(published_at) >= datetime(?) AND datetime(published_at) < datetime(?)").get(B.day_before[0], B.day_before[1]).n || 0; } catch (e) { return 0; } })(),
    failed: evCount('post_failed', B.day_before), weeks_generated: evUniques('week_generate_done', B.day_before) };
  const deltas = {};
  for (const k of Object.keys(yCounts)) deltas[k] = delta(yCounts[k], dCounts[k]);
  // 3) lo que pasa hoy
  let todayPosts = [], pendingWeeks = [];
  try { todayPosts = db.prepare(`SELECT id, user_id, media_type, tipo, scheduled_at FROM posts WHERE status = 'scheduled' AND datetime(scheduled_at) >= datetime(?) AND datetime(scheduled_at) < datetime(?) ORDER BY scheduled_at`).all(B.today[0], B.today[1])
    .map(r => ({ post_id: r.id, user_id: r.user_id, business_name: bizOf(db, r.user_id).business_name || '', media_type: r.media_type, tipo: r.tipo, at: r.scheduled_at, time_art: String(r.scheduled_at || '').slice(11, 16), image_url: '/api/admin/post-image/' + r.id })); } catch (e) {}
  try { pendingWeeks = db.prepare(`SELECT user_id, COUNT(*) AS n FROM posts WHERE approval = 'pending' AND status = 'draft' GROUP BY user_id`).all()
    .map(r => ({ user_id: r.user_id, business_name: bizOf(db, r.user_id).business_name || '', pending: r.n })); } catch (e) {}
  // 4) pulso
  const proj = projection200(db, opts, era);
  let aiYesterday = 0, aiAllTime = 0;
  try { aiYesterday = r2(db.prepare('SELECT COALESCE(SUM(est_cost_usd), 0) AS s FROM api_costs WHERE datetime(ts) >= datetime(?) AND datetime(ts) < datetime(?)').get(B.yesterday[0], B.yesterday[1]).s); } catch (e) {}
  try { aiAllTime = r2(db.prepare('SELECT COALESCE(SUM(est_cost_usd), 0) AS s FROM api_costs').get().s); } catch (e) {}
  return { day_basis: B.label, era: eraInfo(era),
    attention: { alerts, risk_accounts: risk, founder_decisions: founderDecisions },
    yesterday: { counts: yCounts, deltas, payments, registers, published, failed },
    today: { posts: todayPosts, pending_approval_weeks: pendingWeeks,
      radar_pending: null, radar_note: 'sin fuente consultable: las preguntas radar viven en el fundamento de cada cuenta (sin tabla SQL de pendientes); se declara en vez de inventar el número' },
    pulse: { subscribers: proj, ai_cost_yesterday_usd: aiYesterday, ai_cost_all_time_usd: aiAllTime,
      ai_note: 'el ledger de costos de IA nunca se resetea: el acumulado es desde el día uno, sin filtro de época' } };
}

// ---------- TABLERO (vista Negocio) ----------
function windowFor(era, days) {
  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let fromMs = Date.now() - days * 864e5;
  if (era === 'launch') fromMs = Math.max(fromMs, launchEpochMs());
  const fromSql = new Date(fromMs).toISOString().slice(0, 19).replace('T', ' ');
  const prevTo = fromSql;
  const prevFrom = new Date(fromMs - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  return { fromSql, toSql: nowSql, prevFrom, prevTo,
    prev_crosses_epoch: era === 'launch' && (fromMs - days * 864e5) < launchEpochMs() && fromMs > launchEpochMs() - days * 864e5 };
}
function board(db, opts, query) {
  const era = eraOf(query);
  const days = Math.max(1, Math.min(180, Number((query && query.days) || 30)));
  const W = windowFor(era, days);
  const cur = funnelTotals(db, W.fromSql, W.toSql);
  const prev = funnelTotals(db, W.prevFrom, W.prevTo);
  const steps = cur.map((s, i) => ({ ...s, delta: delta(s.users, prev[i] ? prev[i].users : 0) }));
  const { map } = healthMap(db, opts);
  const risk = Object.values(map).filter(v => v.health.level === 'rojo' || v.health.level === 'amarillo')
    .map(v => ({ user_id: v.user.id, business_name: bizOf(db, v.user.id).business_name || v.user.email, level: v.health.level,
      cause: v.health.cause, cause_why: v.health.cause_why, play: v.health.play ? v.health.play.play : null, founder_decision: !!v.health.founder_decision }));
  sweepAutopsies(db, opts);
  return { era: eraInfo(era), window: { days, from: W.fromSql, to: W.toSql, prev_crosses_epoch: !!W.prev_crosses_epoch,
      prev_note: W.prev_crosses_epoch ? 'el período anterior cruza la época: incluye días de la era de prueba (marcado, no oculto)' : '' },
    ttv: timeToValue(db, W.fromSql, W.toSql),
    funnel: { steps, by_src: funnelByDim(db, 'src', W.fromSql, W.toSql), by_lang: funnelByDim(db, 'lang', W.fromSql, W.toSql) },
    money: moneyBoard(db, opts, W.fromSql, W.toSql),
    quality: qualityMetrics(db, W.fromSql, W.toSql),
    cohorts: cohorts(db, W.fromSql, W.toSql),
    projection: projection200(db, opts, era),
    health: { rules: HEALTH_RULES_TEXT, risk_accounts: risk, rescue_by_cause: rescueStats(db) },
    churn: autopsyPatterns(db),
    learning: syncLearning(db),
    dictionary: dictionaryAudit(db),
    alerts: computeAlerts(db, opts) };
}

// ---------- 7) CARTA DEL LUNES DEL FUNDADOR ----------
// Misma estructura que la portada, en clave semanal. Fail-closed: sin datos de
// lanzamiento (época futura) la carta LO DICE en vez de rellenar con la era de
// prueba. La decisión sugerida sale de reglas declaradas sobre los datos.
function ensureLettersTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS founder_letters (
    week_key TEXT PRIMARY KEY, generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    era TEXT NOT NULL DEFAULT 'launch', text TEXT NOT NULL DEFAULT '', data TEXT NOT NULL DEFAULT '{}'
  )`);
}
function founderLetter(db, opts, query) {
  ensureLettersTable(db);
  const era = eraOf(query);
  const wk = mondayOf(new Date().toISOString().slice(0, 19).replace('T', ' ')) || currentWeekKey();
  const existing = db.prepare('SELECT * FROM founder_letters WHERE week_key = ? AND era = ?').get(wk, era);
  if (existing && !(query && query.regen)) {
    return { week_key: wk, era, generated_at: existing.generated_at, text: existing.text, cached: true };
  }
  const lines = [];
  const proj = projection200(db, opts, era);
  lines.push(`☀️ Carta del lunes — semana del ${wk}`);
  lines.push('');
  if (era === 'launch' && Date.now() < launchEpochMs()) {
    lines.push('Todavía estamos en la era de prueba: el lanzamiento es el 1/1/2027 y esta carta se escribe con datos de lanzamiento. Por ahora no proyecto ni concluyo nada con datos de prueba.');
    lines.push('');
    lines.push(`Cuentas en la base hoy: ${(function () { try { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; } catch (e) { return 0; } })()} · pagos activos: ${proj.payers} de 200.`);
    const text = lines.join('\n');
    db.prepare('INSERT OR REPLACE INTO founder_letters (week_key, era, text, data) VALUES (?, ?, ?, ?)').run(wk, era, text, JSON.stringify({ fail_closed: true }));
    return { week_key: wk, era, generated_at: new Date().toISOString(), text, fail_closed: true };
  }
  const fromSql = era === 'launch' ? epochSql() : '1970-01-01 00:00:00';
  const wkStart = wk + ' 00:00:00';
  const signups = (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM users WHERE datetime(created_at) >= datetime(?)').get(wkStart).n || 0; } catch (e) { return 0; } })();
  const paidWeek = funnelUniques(db, 'payment_ok', wkStart, '2999-01-01 00:00:00').size;
  const trialsWeek = funnelUniques(db, 'prueba_view', wkStart, '2999-01-01 00:00:00').size;
  const money = moneyBoard(db, opts, fromSql, new Date().toISOString().slice(0, 19).replace('T', ' '));
  const { map } = healthMap(db, opts);
  const reds = Object.values(map).filter(v => v.health.level === 'rojo');
  const yellows = Object.values(map).filter(v => v.health.level === 'amarillo');
  lines.push(`**Rumbo a los 200:** ${proj.payers} suscriptores pagos (${proj.pct}%). ${proj.status === 'ok' ? proj.basis + '.' : 'Proyección: ' + proj.reason + '.'}`);
  if (proj.lever) lines.push(`Palanca que más adelanta: ${proj.lever.label}.`);
  lines.push('');
  lines.push(`**La semana:** ${trialsWeek} pruebas iniciadas · ${signups} registros · ${paidWeek} pagos. Gasto de IA del período: US$ ${money.totals.cost_period_usd} (acumulado histórico: US$ ${money.totals.cost_all_time_usd}, nunca reseteado). Margen del período: ${money.totals.margin_period_usd != null ? 'US$ ' + money.totals.margin_period_usd : 'sin ingresos medidos todavía'}.`);
  lines.push('');
  lines.push(`**Cuentas en riesgo:** ${reds.length} en rojo, ${yellows.length} en amarillo.`);
  // casos rojos 7+ días con intervención: NOMBRADOS (escalación de la estrategia)
  let named = [];
  try { ensureInterventionsTable(db); named = db.prepare(`SELECT i.*, u.email FROM health_interventions i JOIN users u ON u.id = i.user_id
    WHERE i.status = 'abierta' AND datetime(i.created_at) <= datetime('now', '-7 days')`).all(); } catch (e) {}
  for (const n of named) lines.push(`· ${bizOf(db, n.user_id).business_name || n.email}: causa ${n.cause} — jugada ${n.play} aplicada el ${String(n.created_at).slice(0, 10)} y sigue en rojo.`);
  if (!named.length) lines.push('· Ningún caso lleva 7+ días en rojo con intervención abierta.');
  lines.push('');
  // LA decisión de la semana (una sola, por reglas de impacto)
  let decision;
  if (reds.length >= 3) decision = `atacar los ${reds.length} rojos: es el riesgo más grande de la semana (cada baja cuesta más que un alta nueva)`;
  else if (proj.status === 'ok' && proj.lever) decision = proj.lever.lever === 'conversion' ? 'trabajar la conversión prueba→pago: es la palanca que más adelanta el rumbo a los 200' : 'empujar volumen de pruebas: es la palanca que más adelanta el rumbo a los 200';
  else if (money.totals.cost_period_usd > 0 && money.totals.margin_period_usd != null && money.totals.margin_period_usd < 0) decision = 'revisar el costo de IA por cuenta: el margen del período es negativo';
  else if (yellows.length >= 3) decision = `mirar los ${yellows.length} amarillos antes de que pasen a rojo`;
  else decision = 'seguir empujando altas: no hay fuego encendido esta semana';
  lines.push(`**La decisión de la semana:** ${decision}.`);
  const text = lines.join('\n');
  db.prepare('INSERT OR REPLACE INTO founder_letters (week_key, era, text, data) VALUES (?, ?, ?, ?)').run(wk, era, text,
    JSON.stringify({ payers: proj.payers, signups, paidWeek, reds: reds.length, yellows: yellows.length, decision }));
  return { week_key: wk, era, generated_at: new Date().toISOString(), text, fail_closed: false };
}

module.exports = {
  launchEpochMs, epochSql, eraOf, eraCond, eraInfo, normalizeSrc, CHANNELS,
  funnelTotals, funnelByDim, funnelUniques, timeToValue,
  accountSignals, accountHealth, HEALTH_RULES_TEXT, PLAYS, AI_COST_ALERT_PCT, AI_COST_CAP_PCT,
  accountsOverview, accountPostsDetail, computeAlerts, projection200,
  qualityMetrics, classifyRejections, moneyBoard, cohorts,
  morning, board, founderLetter, rescueStats, autopsyPatterns, sweepAutopsies, snapshotAutopsy,
  syncLearning, dictionaryAudit, EVENT_DICTIONARY, currentWeekKey,
};
