// support-cases.js — CONSOLA DE SOPORTE (lote consola-soporte, base v697).
//
// UN SOLO PANEL de control, de principio a fin (decisión Valentino 5/11
// ~14:19–14:20): el recorrido completo de cada cliente — prueba/onboarding
// → espejo → semana → ritual → publicación → medición — con el estado real
// en cada etapa; si algo se trabó o falló, se ve ahí mismo y abre un caso.
//
// El panel (una sola pantalla): vista general de todos los clientes con
// luces de estado (verde todo bien / ámbar necesita ayuda / rojo algo
// falló), contadores, casos abiertos con número, dueño y siguiente paso, y
// alertas. Lo urgente queda al frente. Referencia visual: el mock 3D
// posty-consola-soporte-mock-3d-v1.png (contadores arriba, cliente que
// necesita ayuda al frente, lista de casos abajo).
//
// Doctrina Atenty (hoy dentro de Gesty): cada problema es un caso con
// número; el caso solo cierra con CONFIRMACIÓN del cliente final; sin
// registro no hay promesa; nunca se inventa un estado (sin dato, se dice
// la verdad y el caso se abre igual).
//
// CONTROL (decisión Valentino 5/11 ~14:13): si el cliente no encuentra lo
// que busca, LO SOLUCIONAMOS NOSOTROS. Desde el espejo el equipo puede
// encontrarle el posteo, reprogramarlo, rehacerlo y responderle en su chat
// como Posty con la corrección hecha — sin que el cliente explique su
// pantalla. TODA acción del equipo queda en support_team_log (quién,
// cuándo, qué) y, si hay un caso abierto, también en su historial.
//
// La consola NUNCA publica: no hay ningún camino de publicación acá.
// Reprogramar / rehacer / responder solo tocan borradores, programados y
// el chat — siempre con registro. Sin dato no se inventa estado: cada
// etapa sin datos reporta 'sin_datos'.
//
// Tablas nuevas (durable, nunca memoria suelta): support_cases,
// support_case_events, support_team_log. El número visible del caso es su
// id (Caso #N). El cierre exige confirmado_por (quién del lado del
// cliente lo confirmó); sin eso closeCase se niega.
'use strict';

const watchdog = require('./publish-watchdog');
const ritualManana = require('./ritual-manana');
const clientDigest = require('./client-digest');
const { dayKeyInTz } = require('./morning-post-push');

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

const FUNNEL_STEPS = [
  'prueba_view', 'prueba_complete', 'prueba_register', 'ig_connect',
  'week_generate_done', 'post_publish', 'payment_ok',
];
const FUNNEL_LABELS = {
  prueba_view: 'Vio la prueba',
  prueba_complete: 'Completó la prueba',
  prueba_register: 'Se registró',
  ig_connect: 'Conectó Instagram',
  week_generate_done: 'Semana generada',
  post_publish: 'Primer posteo publicado',
  payment_ok: 'Pagó',
};

// Tipos de caso: severidad rojo = algo falló (luz roja); ámbar = necesita
// ayuda. defecto_caption NO tiene fuente durable en la DB (los gates de
// caption de Juli no escriben filas: su auditoría vive en
// calidad-captions.md): esos casos se abren a mano desde el panel.
const CASE_TYPES = {
  post_no_publicado: { label: 'Posteo no publicado', severidad: 'rojo' },
  semana_error: { label: 'Error en la semana', severidad: 'rojo' },
  push_9_sin_entregar: { label: 'Push 9:00 sin entregar', severidad: 'rojo' },
  defecto_imagen: { label: 'Defecto en imagen', severidad: 'ambar' },
  defecto_caption: { label: 'Defecto en caption', severidad: 'ambar' },
  prueba_trabada: { label: 'Prueba trabada', severidad: 'ambar' },
  sin_aprobar: { label: 'Sin aprobar', severidad: 'ambar' },
  ayuda: { label: 'Ayuda pedida', severidad: 'ambar' },
  conserje: { label: 'Mensaje en modo conserje', severidad: 'ambar' },
};

function nowUtc(d) {
  const dt = d instanceof Date ? d : new Date(d || Date.now());
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}
function toMs(s) {
  if (!s) return NaN;
  const t = watchdog.parseTime(s);
  return Number.isFinite(t) ? t : NaN;
}
function safe(fn, fallback) {
  try { const r = fn(); return r === undefined ? fallback : r; }
  catch (e) { return fallback; }
}
function trunc(s, n) {
  return String(s == null ? '' : s).slice(0, n || 500);
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS support_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    post_id INTEGER,
    estado TEXT NOT NULL DEFAULT 'abierto',
    dueno TEXT NOT NULL DEFAULT 'equipo',
    siguiente_paso TEXT NOT NULL DEFAULT '',
    dedup_key TEXT NOT NULL DEFAULT '',
    confirmado_por TEXT,
    confirmado_en TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_support_cases_dedup
    ON support_cases(dedup_key) WHERE dedup_key <> ''`);
  db.exec(`CREATE TABLE IF NOT EXISTS support_case_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL,
    actor TEXT NOT NULL DEFAULT 'equipo',
    kind TEXT NOT NULL DEFAULT 'nota',
    texto TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS support_team_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL DEFAULT 'equipo',
    action TEXT NOT NULL,
    user_id INTEGER,
    post_id INTEGER,
    case_id INTEGER,
    detalle TEXT NOT NULL DEFAULT '',
    chat_msg_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // Migración para DBs que ya tienen la tabla sin chat_msg_id (el id del
  // mensaje de chat que dejó la respuesta del operador — es lo que
  // distingue una respuesta real del acuse automático del desvío).
  try { db.exec(`ALTER TABLE support_team_log ADD COLUMN chat_msg_id INTEGER`); } catch (e) { /* ya existe */ }
}

function accountTz(db, uid) {
  const r = safe(() => db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(uid), null);
  return (r && r.timezone) || DEFAULT_TZ;
}

function openCase(db, fields) {
  ensureSchema(db);
  const f = fields || {};
  const uid = Number(f.userId);
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const tipo = String(f.tipo || 'ayuda');
  if (!CASE_TYPES[tipo]) return { ok: false, error: 'tipo_invalido' };
  const dedup = String(f.dedupKey || '');
  if (dedup) {
    const prev = safe(() => db.prepare(
      `SELECT * FROM support_cases WHERE dedup_key = ? AND estado <> 'cerrado'`).get(dedup), null);
    if (prev) return { ok: true, caso: prev, duplicado: true };
  }
  const titulo = trunc(f.titulo || CASE_TYPES[tipo].label, 200);
  const detalle = trunc(f.detalle || '', 2000);
  const r = db.prepare(`INSERT INTO support_cases
    (user_id, tipo, titulo, detalle, post_id, estado, dueno, siguiente_paso, dedup_key)
    VALUES (?, ?, ?, ?, ?, 'abierto', ?, ?, ?)`).run(
    uid, tipo, titulo, detalle, f.postId != null ? Number(f.postId) : null,
    trunc(f.dueno || 'equipo', 80), trunc(f.siguientePaso || '', 500), dedup);
  const caso = db.prepare('SELECT * FROM support_cases WHERE id = ?').get(r.lastInsertRowid);
  addEvent(db, caso.id, { actor: 'sistema', kind: 'alerta', texto: 'Caso abierto: ' + titulo });
  return { ok: true, caso, duplicado: false };
}

function getCase(db, id) {
  ensureSchema(db);
  const row = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(id)), null);
  if (!row) return null;
  const eventos = safe(() => db.prepare(
    'SELECT * FROM support_case_events WHERE case_id = ? ORDER BY id ASC').all(row.id), []);
  const user = safe(() => db.prepare('SELECT id, email FROM users WHERE id = ?').get(row.user_id), null);
  const prof = safe(() => db.prepare(
    'SELECT business_name, ig_username FROM profiles WHERE user_id = ?').get(row.user_id), null);
  return { ...row, numero: row.id, eventos, user: user || null, business_name: (prof && prof.business_name) || '', ig_username: (prof && prof.ig_username) || '' };
}

function listCases(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const where = [];
  const params = [];
  if (o.estado) { where.push(`c.estado = ?`); params.push(o.estado); }
  if (o.userId) { where.push('c.user_id = ?'); params.push(Number(o.userId)); }
  if (o.tipo) { where.push('c.tipo = ?'); params.push(o.tipo); }
  const sql = `SELECT c.*, u.email, p.business_name, p.ig_username
    FROM support_cases c
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN profiles p ON p.user_id = c.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY c.id DESC LIMIT ?`;
  params.push(Math.min(Math.max(Number(o.limit) || 50, 1), 200));
  return safe(() => db.prepare(sql).all(...params), []).map((r) => ({ ...r, numero: r.id }));
}

function addEvent(db, caseId, ev) {
  ensureSchema(db);
  const e = ev || {};
  db.prepare(`INSERT INTO support_case_events (case_id, actor, kind, texto)
    VALUES (?, ?, ?, ?)`).run(Number(caseId), trunc(e.actor || 'equipo', 80),
    trunc(e.kind || 'nota', 40), trunc(e.texto || '', 2000));
  db.prepare(`UPDATE support_cases SET updated_at = datetime('now') WHERE id = ?`).run(Number(caseId));
  return { ok: true };
}

function setOwner(db, caseId, dueno, actor) {
  ensureSchema(db);
  const caso = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(caseId)), null);
  if (!caso) return { ok: false, error: 'no_existe' };
  db.prepare(`UPDATE support_cases SET dueno = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(trunc(dueno || 'equipo', 80), caso.id);
  addEvent(db, caso.id, { actor: actor || 'equipo', kind: 'accion', texto: 'Dueño: ' + trunc(dueno || 'equipo', 80) });
  logTeamAction(db, { actor: actor || 'equipo', action: 'asignar_dueno', userId: caso.user_id, caseId: caso.id, detalle: 'Caso #' + caso.id + ' → ' + trunc(dueno || 'equipo', 80) });
  return { ok: true, caso: getCase(db, caso.id) };
}

function setNextStep(db, caseId, paso, actor) {
  ensureSchema(db);
  const caso = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(caseId)), null);
  if (!caso) return { ok: false, error: 'no_existe' };
  db.prepare(`UPDATE support_cases SET siguiente_paso = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(trunc(paso || '', 500), caso.id);
  addEvent(db, caso.id, { actor: actor || 'equipo', kind: 'accion', texto: 'Siguiente paso: ' + trunc(paso || '', 500) });
  return { ok: true, caso: getCase(db, caso.id) };
}

// Cierre SOLO con confirmación del cliente (doctrina Atenty). Sin
// confirmado_por el cierre se niega y el caso sigue abierto.
function closeCase(db, caseId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const confirmadoPor = trunc(o.confirmadoPor || '', 120).trim();
  const caso = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(caseId)), null);
  if (!caso) return { ok: false, error: 'no_existe' };
  if (caso.estado === 'cerrado') return { ok: false, error: 'ya_cerrado' };
  if (!confirmadoPor) return { ok: false, error: 'sin_confirmacion' };
  const now = nowUtc(o.now);
  db.prepare(`UPDATE support_cases SET estado = 'cerrado', confirmado_por = ?,
    confirmado_en = ?, closed_at = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(confirmadoPor, now, now, caso.id);
  addEvent(db, caso.id, { actor: 'equipo', kind: 'cierre', texto: 'Cerrado con confirmación de: ' + confirmadoPor });
  logTeamAction(db, { actor: 'equipo', action: 'cerrar_caso', userId: caso.user_id, caseId: caso.id, detalle: 'Caso #' + caso.id + ' cerrado, confirmó: ' + confirmadoPor });
  return { ok: true, caso: getCase(db, caso.id) };
}

function reopenCase(db, caseId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const caso = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(caseId)), null);
  if (!caso) return { ok: false, error: 'no_existe' };
  if (caso.estado !== 'cerrado') return { ok: false, error: 'no_cerrado' };
  db.prepare(`UPDATE support_cases SET estado = 'abierto', confirmado_por = NULL,
    confirmado_en = NULL, closed_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(caso.id);
  addEvent(db, caso.id, { actor: o.actor || 'equipo', kind: 'reapertura', texto: trunc(o.texto || 'Caso reabierto.', 500) });
  return { ok: true, caso: getCase(db, caso.id) };
}

function logTeamAction(db, a) {
  ensureSchema(db);
  const x = a || {};
  const r = db.prepare(`INSERT INTO support_team_log (actor, action, user_id, post_id, case_id, detalle, chat_msg_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    trunc(x.actor || 'equipo', 80), trunc(x.action || '', 80),
    x.userId != null ? Number(x.userId) : null,
    x.postId != null ? Number(x.postId) : null,
    x.caseId != null ? Number(x.caseId) : null,
    trunc(x.detalle || '', 2000),
    x.chatMsgId != null ? Number(x.chatMsgId) : null);
  if (x.caseId != null) {
    try {
      addEvent(db, x.caseId, { actor: x.actor || 'equipo', kind: 'accion', texto: trunc((x.action || '') + (x.detalle ? ': ' + x.detalle : ''), 1000) });
    } catch (e) {}
  }
  return { ok: true, id: r.lastInsertRowid };
}

function teamLog(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const where = [];
  const params = [];
  if (o.userId) { where.push('user_id = ?'); params.push(Number(o.userId)); }
  if (o.postId) { where.push('post_id = ?'); params.push(Number(o.postId)); }
  if (o.caseId) { where.push('case_id = ?'); params.push(Number(o.caseId)); }
  const sql = `SELECT * FROM support_team_log
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC LIMIT ?`;
  params.push(Math.min(Math.max(Number(o.limit) || 50, 1), 200));
  return safe(() => db.prepare(sql).all(...params), []);
}

// ---------- Detectores (alertas que abren casos solas) ----------
// Cada detector lee solo fuentes durables y lleva el dato real en el
// detalle. Sin dato no se inventa estado: lo que no tiene fuente no abre
// caso. Los usuarios con publishing_stopped=1 están en pausa por decisión
// del dueño: no se les abren casos de publicación.

function stoppedUsers(db) {
  const rows = safe(() => db.prepare(
    `SELECT id FROM users WHERE COALESCE(publishing_stopped, 0) = 1`).all(), []);
  return new Set(rows.map((r) => r.id));
}

function detectOverdue(db, now, stopped, out) {
  // (a) Escalaciones durables del vigía: ya dedupadas por él (una por
  // posteo + motivo). Son el caso con nombre propio.
  const escs = safe(() => db.prepare(
    `SELECT * FROM publish_watchdog_escalations ORDER BY id ASC`).all(), []);
  for (const e of escs) {
    if (stopped.has(e.user_id)) continue;
    const post = safe(() => db.prepare('SELECT * FROM posts WHERE id = ?').get(e.post_id), null);
    if (post && (post.status === 'published' || post.ig_media_id || post.ig_permalink || post.published_at)) continue;
    const r = openCase(db, {
      userId: e.user_id, tipo: 'post_no_publicado', postId: e.post_id,
      dedupKey: 'esc:' + e.id,
      titulo: 'Posteo #' + e.post_id + ' no salió a su hora',
      detalle: 'El vigía lo escaló (' + (e.reason || 'sin motivo') + ', ' + (e.attempts || 0) +
        ' intentos). Hora original: ' + (e.original_scheduled_at || 'sin dato') + '. ' + trunc(e.detail || '', 300),
      siguientePaso: 'Revisar por qué no salió y reprogramarlo o rehacerlo.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
  // (b) Vencidos vivos: scheduled, hora pasada hace más de 60 min, sin
  // recibo verificado. El vigía ya los reprograma; si a los 60 min siguen
  // sin recibo, algo está realmente trabado y el caso es del equipo.
  const graceMs = 60 * 60 * 1000;
  const rows = safe(() => db.prepare(
    `SELECT * FROM posts WHERE status = 'scheduled'`).all(), []);
  for (const p of rows) {
    if (stopped.has(p.user_id)) continue;
    if (p.approval === 'rejected') continue;
    const t = toMs(p.scheduled_at);
    if (!Number.isFinite(t)) continue;
    if (now.getTime() - t < graceMs) continue;
    if (safe(() => watchdog.hasVerifiedReceipt(db, p), false)) continue;
    const r = openCase(db, {
      userId: p.user_id, tipo: 'post_no_publicado', postId: p.id,
      dedupKey: 'overdue:' + p.id,
      titulo: 'Posteo #' + p.id + ' no salió a su hora',
      detalle: 'Programado para ' + (p.scheduled_at || 'sin dato') + ' y sigue en scheduled sin recibo de publicación. Caption: ' + trunc(p.caption || '', 120),
      siguientePaso: 'Revisar por qué no salió y reprogramarlo o rehacerlo.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
}

function detectWeekError(db, now, stopped, out) {
  const starts = safe(() => db.prepare(
    `SELECT * FROM events WHERE name = 'week_generate_start'
     AND datetime(created_at) >= datetime('now', '-7 days') ORDER BY id ASC`).all(), []);
  const byUser = new Map();
  for (const s of starts) {
    if (!s.user_id || stopped.has(s.user_id)) continue;
    if (!byUser.has(s.user_id) || byUser.get(s.user_id).id < s.id) byUser.set(s.user_id, s);
  }
  for (const [uid, s] of byUser) {
    const done = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND name = 'week_generate_done' AND id > ?`).get(uid, s.id), { c: 0 });
    if ((done && done.c) > 0) continue;
    if (now.getTime() - toMs(s.created_at) < 2 * 60 * 60 * 1000) continue;
    const r = openCase(db, {
      userId: uid, tipo: 'semana_error', dedupKey: 'gen:' + uid + ':' + s.id,
      titulo: 'La semana no se generó',
      detalle: 'La generación empezó ' + (s.created_at || 'sin dato') + ' (evento #' + s.id + ') y no hay week_generate_done después.',
      siguientePaso: 'Revisar el error de generación y regenerar la semana.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
}

function detectStuckTrial(db, now, stopped, out) {
  const rows = safe(() => db.prepare(
    `SELECT * FROM events WHERE name IN ('prueba_view','prueba_complete','prueba_register','ig_connect','week_generate_done','post_publish','payment_ok')
     AND user_id IS NOT NULL AND datetime(created_at) >= datetime('now', '-7 days') ORDER BY id ASC`).all(), []);
  const lastByUser = new Map();
  for (const e of rows) lastByUser.set(e.user_id, e);
  for (const [uid, e] of lastByUser) {
    if (stopped.has(uid)) continue;
    if (e.name !== 'prueba_view' && e.name !== 'prueba_complete') continue;
    if (now.getTime() - toMs(e.created_at) < 24 * 60 * 60 * 1000) continue;
    const r = openCase(db, {
      userId: uid, tipo: 'prueba_trabada', dedupKey: 'trial:' + uid + ':' + e.id,
      titulo: 'Prueba trabada',
      detalle: 'Empezó la prueba (' + e.name + ' el ' + (e.created_at || 'sin dato') + ') y no avanzó en 24 h: sin registro, sin IG, sin semana.',
      siguientePaso: 'Escribirle y ayudarlo a terminar la prueba.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
}

function detectNoApproval(db, now, stopped, out) {
  const rows = safe(() => db.prepare(
    `SELECT * FROM posts WHERE status = 'scheduled'
     AND (approval IS NULL OR approval = 'pending')`).all(), []);
  const byUserWeek = new Map();
  for (const p of rows) {
    if (stopped.has(p.user_id)) continue;
    if (now.getTime() - toMs(p.created_at) < 48 * 60 * 60 * 1000) continue;
    const wk = p.week_key || String(p.created_at || '').slice(0, 10);
    const key = p.user_id + ':' + wk;
    if (!byUserWeek.has(key)) byUserWeek.set(key, { uid: p.user_id, wk, n: 0, first: p.created_at });
    byUserWeek.get(key).n++;
  }
  for (const [key, g] of byUserWeek) {
    const r = openCase(db, {
      userId: g.uid, tipo: 'sin_aprobar', dedupKey: 'noaprob:' + key,
      titulo: 'Semana sin aprobar hace 2 días',
      detalle: (g.n === 1 ? '1 posteo programado sigue sin aprobar desde ' : g.n + ' posteos programados siguen sin aprobar desde ') + (g.first || 'sin dato') + ' (semana ' + g.wk + ').',
      siguientePaso: 'Preguntarle qué le frena y aprobar juntos.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
}

function detectMorningPush(db, now, stopped, out) {
  // La ventana es 9:00 en la zona de CADA cuenta: el day_key se calcula
  // por usuario. El primer filtro trae los usuarios con fila de ritual en
  // los últimos 2 días (el día de una cuenta puede diferir del día por
  // defecto) y cada uno se revalida con su propia zona.
  const ritualRows = safe(() => db.prepare(
    `SELECT DISTINCT user_id FROM pz_ritual WHERE day_key >= date('now', '-2 days')`).all(), []);
  const seen = new Set();
  for (const row of ritualRows) {
    const uid = row.user_id;
    if (seen.has(uid) || stopped.has(uid)) continue;
    seen.add(uid);
    const tz = accountTz(db, uid);
    const dayKey = dayKeyInTz(now, tz);
    let localHHMM = '';
    try {
      localHHMM = now.toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) { localHHMM = ''; }
    const m = /^(\d{2}):(\d{2})$/.exec(localHHMM || '');
    const mins = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    if (mins < 570) continue; // antes de las 9:30 local: todavía no es falta
    const rrow = safe(() => ritualManana.getRow(db, uid, dayKey), null);
    if (!rrow) continue;
    const rec = safe(() => db.prepare(
      'SELECT * FROM posts WHERE id = ?').get(rrow.recommended_post_id), null);
    if (!rec || rec.status !== 'scheduled') continue;
    const mark = safe(() => db.prepare(
      'SELECT 1 AS x FROM morning_post_push WHERE user_id = ? AND day_key = ?').get(uid, dayKey), null);
    if (mark) continue;
    const sub = safe(() => db.prepare(
      'SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?').get(uid), { c: 0 });
    if (!sub || !sub.c) continue; // sin token no es "no entregó": es "sin token"
    const r = openCase(db, {
      userId: uid, tipo: 'push_9_sin_entregar', postId: rec.id, dedupKey: 'push9:' + uid + ':' + dayKey,
      titulo: 'La push de las 9:00 no se entregó',
      detalle: 'El posteo #' + rec.id + ' era el de hoy (' + dayKey + ') y no hay registro de envío en morning_post_push. El cliente tiene token push.',
      siguientePaso: 'Verificar el token y reenviar el aviso de hoy.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
}

function detectQaFail(db, now, stopped, out) {
  const rows = safe(() => db.prepare(
    `SELECT * FROM qa_audit WHERE passed = 0
     AND datetime(created_at) >= datetime('now', '-7 days') ORDER BY id ASC`).all(), []);
  for (const q of rows) {
    let res = {};
    try { res = JSON.parse(q.result || '{}') || {}; } catch (e) { res = {}; }
    const uid = Number(res.user_id || res.userId || 0);
    if (!uid || stopped.has(uid)) continue;
    const pid = Number(res.post_id || res.postId || 0) || null;
    const failed = Array.isArray(res.qa_gate_failed_checks) ? res.qa_gate_failed_checks.join(', ') : '';
    const r = openCase(db, {
      userId: uid, tipo: 'defecto_imagen', postId: pid, dedupKey: 'qa:' + q.id,
      titulo: 'Defecto en imagen detectado por el gate',
      detalle: 'qa_audit #' + q.id + ' (' + (q.created_at || 'sin dato') + '): ' +
        trunc(failed || res.detalle || 'veredicto no pasó', 300) +
        (q.image_path ? ' Imagen: ' + q.image_path : ''),
      siguientePaso: 'Revisar la imagen y regenerarla.',
    });
    if (r.ok && !r.duplicado) out.opened.push(r.caso);
  }
}

function scanAlerts(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date(o.now || Date.now());
  const stopped = stoppedUsers(db);
  const out = { opened: [], checked_at: nowUtc(now) };
  detectOverdue(db, now, stopped, out);
  detectWeekError(db, now, stopped, out);
  detectStuckTrial(db, now, stopped, out);
  detectNoApproval(db, now, stopped, out);
  detectMorningPush(db, now, stopped, out);
  detectQaFail(db, now, stopped, out);
  return out;
}

// Cuando la condición que abrió un caso ya se resolvió sola (el posteo
// salió, la push se entregó), se anota en el historial — pero el caso NO
// se cierra solo: el cierre sigue exigiendo confirmación del cliente.
function refreshCaseStates(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date(o.now || Date.now());
  const noted = [];
  const open = safe(() => db.prepare(
    `SELECT * FROM support_cases WHERE estado <> 'cerrado' AND tipo = 'post_no_publicado' AND post_id IS NOT NULL`).all(), []);
  for (const c of open) {
    const post = safe(() => db.prepare('SELECT * FROM posts WHERE id = ?').get(c.post_id), null);
    if (!post) continue;
    if (!safe(() => watchdog.hasVerifiedReceipt(db, post), false)) continue;
    const already = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM support_case_events WHERE case_id = ? AND texto LIKE '%publicado a las%'`).get(c.id), { c: 0 });
    if ((already && already.c) > 0) continue;
    addEvent(db, c.id, { actor: 'sistema', kind: 'nota',
      texto: 'El posteo salió: publicado a las ' + (post.published_at || 'sin hora registrada') +
        (post.ig_permalink ? ' (' + post.ig_permalink + ')' : '') + '. Falta la confirmación del cliente para cerrar.' });
    noted.push(c.id);
  }
  const pushOpen = safe(() => db.prepare(
    `SELECT * FROM support_cases WHERE estado <> 'cerrado' AND tipo = 'push_9_sin_entregar'`).all(), []);
  for (const c of pushOpen) {
    const tz = accountTz(db, c.user_id);
    const dayKey = dayKeyInTz(now, tz);
    const mark = safe(() => db.prepare(
      'SELECT 1 AS x FROM morning_post_push WHERE user_id = ? AND day_key = ?').get(c.user_id, dayKey), null);
    if (!mark) continue;
    const already = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM support_case_events WHERE case_id = ? AND texto LIKE '%se entregó (registro%'`).get(c.id), { c: 0 });
    if ((already && already.c) > 0) continue;
    addEvent(db, c.id, { actor: 'sistema', kind: 'nota',
      texto: 'La push de las 9:00 se entregó (registro morning_post_push del ' + dayKey + '). Falta la confirmación del cliente para cerrar.' });
    noted.push(c.id);
  }
  return { noted };
}

// ---------- Recorrido de principio a fin (un cliente) ----------

function postView(p, absImageUrl) {
  return {
    id: p.id,
    tipo: p.tipo || p.media_type || '',
    status: p.status || '',
    approval: p.approval || 'pending',
    caption: p.caption || '',
    hashtags: p.hashtags || '',
    scheduled_at: p.scheduled_at || null,
    published_at: p.published_at || null,
    created_at: p.created_at || null,
    error: p.error || '',
    ig_permalink: p.ig_permalink || '',
    strategy_why: p.strategy_why || '',
    image_url: absImageUrl ? safe(() => absImageUrl(p.user_id, p.image_path), null) : null,
  };
}

function buildJourney(db, userId, deps) {
  ensureSchema(db);
  const d = deps || {};
  const absImageUrl = d.absImageUrl || null;
  const now = d.now instanceof Date ? d.now : new Date(d.now || Date.now());
  const uid = Number(userId);
  const user = safe(() => db.prepare('SELECT * FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const prof = safe(() => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uid), null) || {};
  const tz = accountTz(db, uid);
  const dayKey = dayKeyInTz(now, tz);

  const digest = safe(() => clientDigest.getDigest(db, uid), null);
  const funnel = safe(() => db.prepare(
    `SELECT id, name, created_at, props FROM events WHERE user_id = ?
     AND name IN (${FUNNEL_STEPS.map(() => '?').join(',')})
     AND datetime(created_at) >= datetime('now', '-30 days') ORDER BY id ASC`).all(uid, ...FUNNEL_STEPS), []);
  const reached = new Set(funnel.map((e) => e.name));
  const falta = FUNNEL_STEPS.filter((s) => !reached.has(s)).map((s) => FUNNEL_LABELS[s]);
  const lastFunnel = funnel.length ? funnel[funnel.length - 1] : null;
  const stuckTrial = lastFunnel && (lastFunnel.name === 'prueba_view' || lastFunnel.name === 'prueba_complete')
    && (now.getTime() - toMs(lastFunnel.created_at) >= 24 * 60 * 60 * 1000);

  const posts = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status <> 'cancelled' ORDER BY id ASC`).all(uid), []);
  const scheduled = posts.filter((p) => p.status === 'scheduled')
    .sort((a, b) => (toMs(a.scheduled_at) || Infinity) - (toMs(b.scheduled_at) || Infinity));
  const published = posts.filter((p) => p.status === 'published')
    .sort((a, b) => (toMs(b.published_at) || 0) - (toMs(a.published_at) || 0));
  const drafts = posts.filter((p) => p.status === 'draft');

  // El próximo = la carta primera (idx 0): el recomendado del ritual de
  // hoy si está programado, si no el programado futuro más cercano.
  let proximo = null;
  const rrow = safe(() => ritualManana.getRow(db, uid, dayKey), null);
  if (rrow && rrow.recommended_post_id) {
    proximo = scheduled.find((p) => p.id === rrow.recommended_post_id) || null;
  }
  if (!proximo) proximo = scheduled.find((p) => Number.isFinite(toMs(p.scheduled_at)) && toMs(p.scheduled_at) >= now.getTime() - 60 * 60 * 1000) || null;
  const semana = scheduled.filter((p) => !proximo || p.id !== proximo.id);

  const snap = safe(() => db.prepare('SELECT payload FROM ig_home_snapshot WHERE user_id = ?').get(uid), null);
  let recents = [];
  if (snap && snap.payload) {
    try {
      const pay = JSON.parse(snap.payload);
      if (Array.isArray(pay.recents)) {
        recents = pay.recents.filter((r) => r && r.img).map((r) => ({
          img: r.img, type: r.type || 'image', taken_at: r.taken_at || null,
          shortcode: r.shortcode || null, likes: r.likes == null ? null : r.likes,
          comments: r.comments == null ? null : r.comments, pinned: r.pinned === true ? true : null,
        }));
      }
    } catch (e) { recents = []; }
  }

  const chat = safe(() => db.prepare(
    `SELECT id, role, text, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 30`).all(uid), []).reverse();

  // (CHAT-FOTO) Las fotos recientes del cliente, junto al hilo: el chat
  // habla de fotos («te mando una foto», «cambiame esto») y el conserje
  // tiene que VER de qué foto se habla, no solo leer el texto.
  const fotos = safe(() => db.prepare(
    `SELECT id, file_path, thumb_path, album_tag, album_vision, created_at FROM assets WHERE user_id = ? AND kind = 'photo' ORDER BY id DESC LIMIT 10`).all(uid), []);

  const failedEvents = safe(() => db.prepare(
    `SELECT id, name, created_at, props FROM events WHERE user_id = ? AND name = 'post_failed'
     AND datetime(created_at) >= datetime('now', '-30 days') ORDER BY id DESC LIMIT 10`).all(uid), []);

  const pub30 = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'
     AND datetime(COALESCE(published_at, created_at)) >= datetime('now', '-30 days')`).get(uid), { c: 0 });
  const appr = safe(() => db.prepare(
    `SELECT approval, COUNT(*) AS c FROM posts WHERE user_id = ? AND status IN ('scheduled','published')
     AND datetime(created_at) >= datetime('now', '-30 days') GROUP BY approval`).all(uid), []);
  let apprN = 0, rejN = 0;
  for (const r of appr) {
    if (r.approval === 'approved' || r.approval === 'auto') apprN += r.c;
    if (r.approval === 'rejected') rejN += r.c;
  }
  const lastPub = published.length ? published[0] : null;
  const interv = safe(() => db.prepare(
    `SELECT * FROM health_interventions WHERE user_id = ? AND status = 'abierta'`).all(uid), []);

  const casos = listCases(db, { userId: uid, estado: 'abierto', limit: 20 });
  const casosEnCurso = listCases(db, { userId: uid, estado: 'en_curso', limit: 20 });
  const openCases = casos.concat(casosEnCurso);
  const hasRojo = openCases.some((c) => (CASE_TYPES[c.tipo] || {}).severidad === 'rojo');
  const luz = hasRojo ? 'rojo' : (openCases.length || interv.length ? 'ambar' : 'verde');

  const stages = [];
  // 1 · Prueba / onboarding
  stages.push({
    key: 'prueba', titulo: 'Prueba / onboarding',
    estado: !funnel.length ? 'sin_datos' : (reached.has('post_publish') || reached.has('payment_ok') ? 'ok' : (stuckTrial ? 'falla' : 'atencion')),
    resumen: !funnel.length ? 'Sin eventos de prueba en los últimos 30 días.'
      : reached.has('payment_ok') ? 'Prueba completa y pagando.'
      : reached.has('post_publish') ? 'Prueba completa: ya publicó.'
      : stuckTrial ? 'Empezó la prueba y no avanzó en 24 h.'
      : 'Prueba en curso: ' + (lastFunnel ? (FUNNEL_LABELS[lastFunnel.name] || lastFunnel.name) : ''),
    eventos: funnel.map((e) => ({ name: e.name, label: FUNNEL_LABELS[e.name] || e.name, created_at: e.created_at })),
    falta,
    digest: digest ? {
      business: digest.business || '', category: digest.category || '', ciudad: digest.ciudad || '',
      productos: (digest.productos || []).length, servicios: (digest.servicios || []).length,
      promos: (digest.promos || []).length,
      onboarding: digest.onboarding && typeof digest.onboarding === 'object' ? digest.onboarding : null,
      linea_editorial: digest.linea_editorial || null,
    } : null,
  });
  // 2 · Espejo (su feed tal como lo ve)
  stages.push({
    key: 'espejo', titulo: 'Espejo — su feed tal como lo ve',
    estado: !posts.length && !recents.length ? 'sin_datos' : (proximo ? 'ok' : 'atencion'),
    resumen: !posts.length && !recents.length ? 'Sin posteos ni lectura de Instagram.'
      : proximo ? 'El próximo es el #' + proximo.id + ' (' + (proximo.scheduled_at || 'sin hora') + ').'
      : 'Sin próximo programado.',
    proximo: proximo ? postView(proximo, absImageUrl) : null,
    semana: semana.map((p) => postView(p, absImageUrl)),
    publicados: published.map((p) => postView(p, absImageUrl)),
    en_instagram: recents,
  });
  // 3 · Semana (planeados, con porqué)
  const pendingOld = scheduled.filter((p) => (p.approval || 'pending') === 'pending'
    && now.getTime() - toMs(p.created_at) >= 48 * 60 * 60 * 1000);
  stages.push({
    key: 'semana', titulo: 'Semana — posteos planeados',
    estado: !scheduled.length ? 'sin_datos' : (pendingOld.length ? 'atencion' : 'ok'),
    resumen: !scheduled.length ? 'Sin posteos programados.'
      : scheduled.length + ' programado(s)' + (pendingOld.length ? ' · ' + pendingOld.length + ' sin aprobar hace 2+ días.' : ' · todos aprobados o en revisión.'),
    posts: scheduled.map((p) => postView(p, absImageUrl)),
    borradores: drafts.length,
  });
  // 4 · Ritual (qué eligió hoy)
  stages.push({
    key: 'ritual', titulo: 'Ritual — qué eligió hoy',
    estado: !rrow ? 'sin_datos' : (rrow.picked_post_id ? 'ok' : 'atencion'),
    resumen: !rrow ? 'Hoy no hay paquete de ritual.'
      : rrow.picked_post_id ? 'Eligió el posteo #' + rrow.picked_post_id + ' (' + (rrow.picked_at || 'sin hora') + ').'
      : 'Todavía no eligió el posteo de hoy.',
    dia: dayKey,
    recomendado: rrow ? rrow.recommended_post_id : null,
    alternativas: rrow ? safe(() => JSON.parse(rrow.alt_post_ids || '[]'), []) : [],
    elegido: rrow ? rrow.picked_post_id : null,
    elegido_en: rrow ? rrow.picked_at : null,
  });
  // 5 · Publicación (qué salió, qué falló)
  const failed24 = failedEvents.filter((e) => now.getTime() - toMs(e.created_at) < 24 * 60 * 60 * 1000);
  stages.push({
    key: 'publicacion', titulo: 'Publicación — qué salió, qué falló',
    estado: failed24.length ? 'falla' : (!published.length && !failedEvents.length ? 'sin_datos' : 'ok'),
    resumen: failed24.length ? (failed24.length === 1 ? '1 posteo falló en las últimas 24 h.' : failed24.length + ' posteos fallaron en las últimas 24 h.')
      : !published.length && !failedEvents.length ? 'Sin publicaciones ni fallos registrados en 30 días.'
      : (lastPub ? 'Último publicado: #' + lastPub.id + ' (' + (lastPub.published_at || 'sin hora') + ').' : 'Sin publicados en 30 días.'),
    publicados: published.slice(0, 10).map((p) => postView(p, absImageUrl)),
    fallidos: failedEvents.map((e) => {
      let props = {};
      try { props = JSON.parse(e.props || '{}') || {}; } catch (ee) { props = {}; }
      return { id: e.id, created_at: e.created_at, post_id: props.post_id || props.postId || null, causa: props.cause || props.error || props.reason || '' };
    }),
  });
  // 6 · Medición (qué rindió)
  const hasMedicion = (pub30.c || 0) > 0 || apprN > 0 || rejN > 0;
  stages.push({
    key: 'medicion', titulo: 'Medición — qué rindió',
    estado: !hasMedicion ? 'sin_datos' : 'ok',
    resumen: !hasMedicion ? 'Sin datos de medición todavía.'
      : (pub30.c || 0) + ' publicado(s) en 30 días · aprobación ' + (apprN + rejN ? Math.round(apprN / (apprN + rejN) * 100) + '%' : 'sin dato') + '.',
    publicados_30d: pub30.c || 0,
    aprobados_30d: apprN, rechazados_30d: rejN,
    ultima_publicacion: lastPub ? (lastPub.published_at || null) : null,
    intervenciones_abiertas: interv.length,
  });

  return {
    ok: true,
    user: {
      id: uid, email: user.email || '', plan: user.plan || '', plan_status: user.plan_status || '',
      business_name: prof.business_name || '', ig_username: prof.ig_username || '',
      category: prof.category || '', timezone: tz,
      concierge: isConcierge(db, uid),
    },
    luz,
    casos_abiertos: openCases.map((c) => ({ ...c, numero: c.id })),
    stages,
    chat: chat.map((m) => ({ id: m.id, role: m.role, text: m.text, created_at: m.created_at })),
    fotos_recientes: fotos.map((f) => ({ id: f.id, file_path: f.file_path, thumb_path: f.thumb_path || '', album_tag: f.album_tag || '', album_vision: f.album_vision || '', created_at: f.created_at })),
  };
}

// ---------- Panel: todo bajo control en una pantalla ----------

function luzFor(db, uid, openCases) {
  if (openCases.some((c) => (CASE_TYPES[c.tipo] || {}).severidad === 'rojo')) return 'rojo';
  if (openCases.length) return 'ambar';
  const interv = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM health_interventions WHERE user_id = ? AND status = 'abierta'`).get(uid), { c: 0 });
  return (interv && interv.c) > 0 ? 'ambar' : 'verde';
}

function buildOverview(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const now = o.now instanceof Date ? o.now : new Date(o.now || Date.now());
  const users = safe(() => db.prepare(
    `SELECT * FROM users WHERE plan_status IN ('trial','active')
     OR id IN (SELECT DISTINCT user_id FROM posts WHERE datetime(created_at) >= datetime('now', '-30 days'))
     OR id IN (SELECT DISTINCT user_id FROM events WHERE user_id IS NOT NULL AND datetime(created_at) >= datetime('now', '-30 days'))
     ORDER BY id ASC LIMIT 50`).all(), []);
  const clientes = [];
  for (const u of users) {
    const prof = safe(() => db.prepare('SELECT business_name, ig_username FROM profiles WHERE user_id = ?').get(u.id), null) || {};
    const open = listCases(db, { userId: u.id, estado: 'abierto', limit: 10 });
    const luz = luzFor(db, u.id, open);
    const sched = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'scheduled'`).get(u.id), { c: 0 });
    const pub7 = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'published'
       AND datetime(COALESCE(published_at, created_at)) >= datetime('now', '-7 days')`).get(u.id), { c: 0 });
    const lastCase = open.length ? open[0] : null;
    clientes.push({
      user_id: u.id, email: u.email || '', plan: u.plan || '', plan_status: u.plan_status || '',
      business_name: prof.business_name || '', ig_username: prof.ig_username || '',
      luz, casos_abiertos: open.length,
      casos_rojos: open.filter((c) => (CASE_TYPES[c.tipo] || {}).severidad === 'rojo').length,
      programados: (sched && sched.c) || 0, publicados_7d: (pub7 && pub7.c) || 0,
      siguiente_paso: lastCase ? (lastCase.siguiente_paso || '') : '',
      caso_urgente: lastCase ? { numero: lastCase.id, tipo: lastCase.tipo, titulo: lastCase.titulo } : null,
    });
  }
  const rank = { rojo: 0, ambar: 1, verde: 2 };
  clientes.sort((a, b) => (rank[a.luz] - rank[b.luz]) || (b.casos_abiertos - a.casos_abiertos) || (a.user_id - b.user_id));
  const casos = listCases(db, { estado: 'abierto', limit: 20 });
  const pubHoy = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM posts WHERE status = 'published'
     AND date(COALESCE(published_at, created_at)) = date('now')`).get(), { c: 0 });
  const pruebas = safe(() => db.prepare(
    `SELECT COUNT(DISTINCT user_id) AS c FROM events WHERE name IN ('prueba_view','prueba_complete')
     AND user_id IS NOT NULL AND datetime(created_at) >= datetime('now', '-7 days')
     AND user_id NOT IN (SELECT DISTINCT user_id FROM events WHERE name IN ('prueba_register','post_publish','payment_ok') AND user_id IS NOT NULL)`).get(), { c: 0 });
  return {
    ok: true,
    generado_en: nowUtc(now),
    contadores: {
      clientes_en_vista: clientes.length,
      necesitan_ayuda: clientes.filter((c) => c.luz !== 'verde').length,
      casos_abiertos: casos.length,
      casos_rojos: casos.filter((c) => (CASE_TYPES[c.tipo] || {}).severidad === 'rojo').length,
      publicados_hoy: (pubHoy && pubHoy.c) || 0,
      pruebas_en_curso: (pruebas && pruebas.c) || 0,
    },
    clientes,
    casos: casos.map((c) => ({ ...c, numero: c.id })),
  };
}

// ---------- Acciones del equipo (CONTROL) ----------
// Todas escriben en support_team_log. Ninguna publica: reprogramar y
// rehacer solo mueven posteos entre programado/borrador; responder solo
// escribe en el chat como Posty. Si hay un caso abierto sobre ese posteo
// o cliente, la acción queda también en su historial.

function openCaseForPost(db, postId) {
  return safe(() => db.prepare(
    `SELECT * FROM support_cases WHERE post_id = ? AND estado <> 'cerrado' ORDER BY id DESC LIMIT 1`).get(Number(postId)), null);
}
function openCaseForUser(db, userId) {
  return safe(() => db.prepare(
    `SELECT * FROM support_cases WHERE user_id = ? AND estado <> 'cerrado' ORDER BY id DESC LIMIT 1`).get(Number(userId)), null);
}

function reschedulePost(db, postId, newScheduledAt, opts) {
  ensureSchema(db);
  const o = opts || {};
  const actor = o.actor || 'equipo';
  const post = safe(() => db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(postId)), null);
  if (!post) return { ok: false, error: 'no_existe' };
  if (post.status !== 'scheduled') return { ok: false, error: 'no_programado' };
  const t = toMs(newScheduledAt);
  if (!Number.isFinite(t)) return { ok: false, error: 'fecha_invalida' };
  const norm = new Date(t).toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`UPDATE posts SET scheduled_at = ? WHERE id = ?`).run(norm, post.id);
  const caso = openCaseForPost(db, post.id);
  logTeamAction(db, { actor, action: 'reprogramar', userId: post.user_id, postId: post.id,
    caseId: caso ? caso.id : null,
    detalle: 'Posteo #' + post.id + ' de ' + (post.scheduled_at || 'sin hora') + ' → ' + norm });
  return { ok: true, post: { id: post.id, scheduled_at: norm } };
}

function redoPost(db, postId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const actor = o.actor || 'equipo';
  const note = trunc(o.note || '', 500);
  const post = safe(() => db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(postId)), null);
  if (!post) return { ok: false, error: 'no_existe' };
  const caso = openCaseForPost(db, post.id);
  const log = (detalle) => logTeamAction(db, { actor, action: 'rehacer', userId: post.user_id,
    postId: post.id, caseId: caso ? caso.id : null, detalle });
  // Borrador en revisión: mismo camino que el rechazo de la cola de
  // revisión — señal + regla de estilo, se borra y se regenera otro.
  if (post.status === 'draft' && Number(post.needs_review || 0) === 1) {
    try {
      const prof = safe(() => db.prepare('SELECT category FROM profiles WHERE user_id = ?').get(post.user_id), null) || {};
      db.prepare(`INSERT INTO post_signals (user_id, post_id, caption, hashtags, scheduled_for, rubro, client_signal, week_key, updated_at)
        VALUES (?,?,?,?,?,?,'rejected',?,datetime('now'))
        ON CONFLICT(user_id, post_id) DO UPDATE SET client_signal='rejected', caption=excluded.caption, updated_at=datetime('now')`)
        .run(post.user_id, post.id, post.caption || '', post.hashtags || '', '', prof.category || '', post.week_key || '');
      if (note) {
        db.prepare(`INSERT INTO style_rules (user_id, rule_key, rule_text, hits, active) VALUES (?, ?, ?, 1, 1)
          ON CONFLICT(user_id, rule_key) DO UPDATE SET rule_text=excluded.rule_text, active=1, hits=hits+1`)
          .run(post.user_id, 'review-' + post.id, 'Revisión: ' + note);
      }
    } catch (e) { /* las tablas de señales son opcionales: el rehacer no se frena */ }
    db.prepare(`DELETE FROM posts WHERE id = ?`).run(post.id);
    if (typeof o.regen === 'function') {
      try {
        const p = o.regen(post.user_id, post.week_key || '', post.source_topic || '');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) {}
    }
    log('Borrador #' + post.id + ' rechazado y regenerando' + (note ? ' — ' + note : ''));
    return { ok: true, modo: 'regenerar', post_id: post.id };
  }
  // Programado: vuelve a borrador sin fecha, pendiente de aprobación.
  if (post.status === 'scheduled') {
    db.prepare(`UPDATE posts SET status = 'draft', scheduled_at = NULL, approval = 'pending', error = '' WHERE id = ?`).run(post.id);
    log('Posteo #' + post.id + ' volvió a borrador para rehacerlo' + (note ? ' — ' + note : ''));
    return { ok: true, modo: 'borrador', post_id: post.id };
  }
  return { ok: false, error: 'no_rehacer' };
}

function replyAsPosty(db, userId, texto, opts) {
  ensureSchema(db);
  const o = opts || {};
  const actor = o.actor || 'equipo';
  const text = trunc((texto || '').trim(), 2000);
  if (!text) return { ok: false, error: 'texto_vacio' };
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(Number(userId)), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const r = db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`)
    .run(Number(userId), text);
  const caso = o.caseId ? safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(o.caseId)), null)
    : openCaseForUser(db, Number(userId));
  logTeamAction(db, { actor, action: 'responder_chat', userId: Number(userId),
    caseId: caso ? caso.id : null, chatMsgId: r.lastInsertRowid,
    detalle: 'El equipo respondió en el chat como Posty: ' + trunc(text, 200) });
  return { ok: true, id: r.lastInsertRowid, case_id: caso ? caso.id : null };
}

// ---------- MODO CONSERJE + PANEL DEL DUEÑO (lote conserje, base v697) ----------
// Un flag durable por cliente (users.concierge). Cuando está prendido el
// cerebro automático NO responde solo: el mensaje del cliente se guarda,
// abre/actualiza su caso conserje (UN caso vivo por cliente, dedup
// 'concierge:<uid>') y el cliente recibe un acuse honesto de Posty. El
// operador responde después desde la consola como Posty (replyAsPosty).
// FAIL-SAFE: divertToConcierge NUNCA lanza (todo en try/catch, devuelve
// {ok:false}); el llamador (el chat) sigue con la IA si el desvío falla —
// el cliente nunca queda sin respuesta y su mensaje nunca se pierde.
//
// El PANEL DEL DUEÑO es solo lectura de lo que el operador hace de
// verdad: el registro es support_team_log (respuestas, reprogramaciones,
// rehaceres, envíos de la mañana, acciones del operador), con el nombre
// del cliente y la hora. Nunca un mock ni datos inventados. La Bandeja
// son los casos abiertos cuyo dueño es Valentino: ahí sí decide él (las
// acciones de caso existentes: nota, paso, cerrar con confirmación).

const CONCIERGE_ACK = 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.';
const OWNER_NAMES = ['valentino', 'dueño', 'dueno', 'owner'];

const ACTION_LABELS = {
  responder_chat: 'Respondió en el chat como Posty',
  reprogramar: 'Reprogramó el posteo',
  rehacer: 'Rehizo el posteo',
  conserje_on: 'Activó modo conserje',
  conserje_off: 'Desactivó modo conserje',
  envio_manana: 'Confirmó / envió la mañana',
  foto_mejorada: 'Mejoró una foto',
  posteo_creado: 'Creó un posteo',
  posteo_editado: 'Editó un posteo',
  video_premium: 'Video premium',
  asignar_dueno: 'Asignó dueño del caso',
  cerrar_caso: 'Cerró un caso',
};

function isConcierge(db, uid) {
  try {
    const r = db.prepare('SELECT concierge FROM users WHERE id = ?').get(Number(uid));
    return !!(r && Number(r.concierge) === 1);
  } catch (e) { return false; }
}

function setConcierge(db, uid, on, actor) {
  ensureSchema(db);
  const user = safe(() => db.prepare('SELECT id, email FROM users WHERE id = ?').get(Number(uid)), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  try {
    db.prepare('UPDATE users SET concierge = ? WHERE id = ?').run(on ? 1 : 0, Number(uid));
  } catch (e) { return { ok: false, error: 'sin_columna' }; }
  logTeamAction(db, { actor: actor || 'equipo', action: on ? 'conserje_on' : 'conserje_off',
    userId: Number(uid),
    detalle: on ? 'Modo conserje activado: el cerebro automático se pausa para este cliente.'
      : 'Modo conserje desactivado: el cerebro automático vuelve a responder solo.' });
  return { ok: true, user_id: Number(uid), concierge: !!on };
}

// Desvío del mensaje del cliente a la Bandeja. NUNCA lanza.
function divertToConcierge(db, uid, text) {
  try {
    ensureSchema(db);
    const userId = Number(uid);
    if (!userId) return { ok: false, error: 'sin_usuario' };
    const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(userId), null);
    if (!user) return { ok: false, error: 'sin_usuario' };
    const msg = trunc(String(text || '').trim(), 2000);
    if (!msg) return { ok: false, error: 'texto_vacio' };
    const r = openCase(db, {
      userId, tipo: 'conserje', dedupKey: 'concierge:' + userId,
      titulo: 'Mensaje en modo conserje',
      detalle: msg,
      siguientePaso: 'Responder en el chat como Posty.',
    });
    if (!r.ok || !r.caso) return { ok: false, error: 'sin_caso' };
    const caso = r.caso;
    addEvent(db, caso.id, { actor: 'cliente', kind: 'mensaje', texto: msg });
    try {
      db.prepare(`UPDATE support_cases SET detalle = ?, siguiente_paso = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(msg, 'Responder en el chat como Posty.', caso.id);
    } catch (e) {}
    return { ok: true, caso_id: caso.id, ack: CONCIERGE_ACK };
  } catch (e) {
    return { ok: false, error: 'desvio_fallo' };
  }
}

// Última respuesta REAL del operador: el id del mensaje de chat que
// dejó (support_team_log.chat_msg_id). El acuse automático del desvío NO
// deja registro — si no, el mensaje quedaría marcado como atendido sin
// que nadie lo haya leído. Por id (no por hora): dos mensajes en el
// mismo segundo no se confunden.
function lastOperatorReplyMsgId(db, uid) {
  const r = safe(() => db.prepare(
    `SELECT MAX(chat_msg_id) AS m FROM support_team_log WHERE user_id = ? AND action = 'responder_chat'`).get(Number(uid)), null);
  const m = r && r.m != null ? Number(r.m) : 0;
  return Number.isFinite(m) ? m : 0;
}

function pendingCountFor(db, uid) {
  const lastId = lastOperatorReplyMsgId(db, uid);
  const row = safe(() => db.prepare(
    `SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = ? AND role = 'user' AND id > ?`).get(Number(uid), lastId), { c: 0 });
  return (row && row.c) || 0;
}

// ---------- PANEL V2 (conserje-panel-v2, base v698) ----------
// El panel del dueño muestra el trabajo, no ceros: por cliente, su foto
// (la imagen de su posteo más reciente, producto real), su posteo de hoy,
// su feed (últimos publicados + próximo programado), su mañana (confirmada
// o no) y sus próximos posteos. Las alertas son solo hechos reales de la
// DB (posteo fallido, sin posteo mañana, mensaje >2h sin respuesta).
// Si el enriquecimiento falla, el cliente sale con la forma vieja (nunca
// un 500 del panel por un dato nuevo).

// Etiqueta corta y honesta para una fecha en la zona de la cuenta:
// «hoy 17:00», «mañana 12:00» o «vie 14/11 17:00».
function cuandoLabel(ms, tz, nowMs) {
  const t = Number(ms);
  if (!Number.isFinite(t)) return '';
  try {
    const zone = tz || DEFAULT_TZ;
    const hora = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(t));
    const hoyKey = dayKeyInTz(new Date(Number(nowMs) || Date.now()), zone);
    const manKey = dayKeyInTz(new Date((Number(nowMs) || Date.now()) + 24 * 3600 * 1000), zone);
    const key = dayKeyInTz(new Date(t), zone);
    if (key === hoyKey) return 'hoy ' + hora;
    if (key === manKey) return 'mañana ' + hora;
    const dia = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: zone }).format(new Date(t)).replace(/[.,]/g, '');
    return dia + ' ' + hora;
  } catch (e) { return ''; }
}

// Vista mínima de un posteo para el panel: foto, caption, día y hora.
// `img` resuelve la URL absoluta; `p` puede ser una fila de posts o la
// vista que devuelve morningFor (ambas llevan image_path).
function postViewMini(uid, p, img, tz, nowMs) {
  if (!p) return null;
  const t = toMs(p.scheduled_at);
  return {
    id: p.id, caption: p.caption || '', scheduled_at: p.scheduled_at || null,
    published_at: p.published_at || null, status: p.status || '', approval: p.approval || '',
    image_url: img(p), tipo: p.tipo || p.media_type || '', strategy_why: p.strategy_why || '',
    cuando: cuandoLabel(t, tz, nowMs),
  };
}

// Datos nuevos del panel por cliente: foto, posteo de hoy, feed, mañana,
// próximos. Todo de la DB; sin dato, null/vacío — nunca inventado.
function panelClientExtra(db, uid, opts) {
  const o = opts || {};
  const abs = typeof o.absImageUrl === 'function' ? o.absImageUrl : null;
  const img = (p) => (p ? (abs ? abs(uid, p.image_path) : (p.image_path || '')) : '');
  const tz = accountTz(db, uid);
  const now = new Date();
  const nowMs = now.getTime();
  // Foto del negocio: su posteo más reciente con imagen (publicado primero).
  const fotoRow = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status <> 'cancelled' AND COALESCE(image_path, '') <> ''
     ORDER BY (status = 'published') DESC, id DESC LIMIT 1`).get(uid), null);
  const foto = fotoRow ? img(fotoRow) : null;
  // Posteo de hoy + mañana (reusa morningFor: ritual + programados de hoy).
  const man = morningFor(db, uid);
  const hoy = man.ok ? (man.elegido || man.recomendado || (man.posts_hoy && man.posts_hoy[0]) || null) : null;
  const posteoHoy = hoy ? postViewMini(uid, hoy, img, tz, nowMs) : null;
  // ¿La mañana ya se confirmó hoy? (envio_manana en el registro, fecha de
  // hoy en la zona de la cuenta).
  const ultimoEnvio = safe(() => db.prepare(
    `SELECT created_at FROM support_team_log WHERE user_id = ? AND action = 'envio_manana' ORDER BY id DESC LIMIT 1`).get(uid), null);
  const diaHoy = dayKeyInTz(now, tz);
  const confirmada = !!(ultimoEnvio && dayKeyInTz(new Date(toMs(ultimoEnvio.created_at)), tz) === diaHoy);
  const manana = man.ok ? {
    dia: man.dia,
    recomendado: man.recomendado ? postViewMini(uid, man.recomendado, img, tz, nowMs) : null,
    elegido: man.elegido ? postViewMini(uid, man.elegido, img, tz, nowMs) : null,
    posts_hoy: (man.posts_hoy || []).map((p) => postViewMini(uid, p, img, tz, nowMs)),
    confirmada, confirmado_en: confirmada ? ultimoEnvio.created_at : null,
  } : { dia: diaHoy, recomendado: null, elegido: null, posts_hoy: [], confirmada: false, confirmado_en: null };
  // Feed: últimos publicados (3) + próximo programado. El panel piensa
  // en días (como morningFor), no en horas: el próximo es el primer
  // programado de hoy en adelante, aunque su hora ya haya pasado y siga
  // en scheduled (en producción ya habría salido o estaría trabado).
  const publicados = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status = 'published'
     ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 3`).all(uid), []);
  const schedAll = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC`).all(uid), []);
  const keyOf = (p) => { const t = toMs(p.scheduled_at); return Number.isFinite(t) ? dayKeyInTz(new Date(t), tz) : ''; };
  const proximo = schedAll.find((p) => keyOf(p) >= diaHoy) || null;
  const feed = {
    publicados: publicados.map((p) => postViewMini(uid, p, img, tz, nowMs)),
    proximo: proximo ? postViewMini(uid, proximo, img, tz, nowMs) : null,
  };
  // Próximos 7 días (para la sección «Próximos posteos»): de hoy en
  // adelante, por día de la cuenta.
  const finKey = dayKeyInTz(new Date(nowMs + 7 * 24 * 3600 * 1000), tz);
  const proximos = schedAll
    .filter((p) => { const k = keyOf(p); return k && k >= diaHoy && k <= finKey; })
    .slice(0, 5)
    .map((p) => postViewMini(uid, p, img, tz, nowMs));
  return {
    foto, posteo_hoy: posteoHoy, posts_hoy_total: man.ok ? (man.posts_hoy || []).length : 0,
    proximos_semana: proximos.length, proximos, feed, manana,
  };
}

function panelClientExtraSafe(db, uid, opts) {
  try { return panelClientExtra(db, uid, opts); }
  catch (e) {
    return { foto: null, posteo_hoy: null, posts_hoy_total: 0, proximos_semana: 0,
      proximos: [], feed: { publicados: [], proximo: null },
      manana: { dia: '', recomendado: null, elegido: null, posts_hoy: [], confirmada: false, confirmado_en: null } };
  }
}

// Alertas del panel: SOLO hechos reales de la DB. Reglas:
// 1 · post_fallido: evento post_failed en las últimas 24 h.
// 2 · sin_posteo_manana: cliente en conserje sin posteo programado mañana.
// 3 · mensaje_sin_respuesta: mensajes pendientes con el último hace ≥ 2 h.
// Sin nada: lista vacía (la vista no muestra nada, nunca un rojo inventado).
function panelAlerts(db, clientes) {
  const nowMs = Date.now();
  const alertas = [];
  for (const c of clientes || []) {
    const uid = c.user_id;
    const nombre = c.business_name || c.email || ('usuario ' + uid);
    const tz = accountTz(db, uid);
    const fails = safe(() => db.prepare(
      `SELECT id, created_at, props FROM events WHERE user_id = ? AND name = 'post_failed'
       AND datetime(created_at) >= datetime('now', '-1 day') ORDER BY id DESC LIMIT 3`).all(uid), []);
    for (const f of fails) {
      let pr = {};
      try { pr = JSON.parse(f.props || '{}'); } catch (e) {}
      alertas.push({ tipo: 'post_fallido', user_id: uid, business_name: nombre, post_id: pr.post_id || null,
        detalle: 'El posteo' + (pr.post_id ? ' #' + pr.post_id : '') + ' de ' + nombre + ' falló'
          + (pr.cause ? ': ' + String(pr.cause).slice(0, 120) : '') + '.',
        created_at: f.created_at });
    }
    const mananaKey = dayKeyInTz(new Date(nowMs + 24 * 3600 * 1000), tz);
    const sched = safe(() => db.prepare(
      `SELECT scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled'`).all(uid), []);
    const hayManana = sched.some((p) => {
      const t = toMs(p.scheduled_at);
      return Number.isFinite(t) && dayKeyInTz(new Date(t), tz) === mananaKey;
    });
    if (!hayManana) {
      alertas.push({ tipo: 'sin_posteo_manana', user_id: uid, business_name: nombre, post_id: null,
        detalle: nombre + ' no tiene posteo programado para mañana.',
        created_at: nowUtc() });
    }
    if (c.pendiente && c.ultimo_mensaje_en) {
      const t = toMs(c.ultimo_mensaje_en);
      const horas = Number.isFinite(t) ? Math.floor((nowMs - t) / 3600000) : 0;
      if (horas >= 2) {
        alertas.push({ tipo: 'mensaje_sin_respuesta', user_id: uid, business_name: nombre, post_id: null,
          detalle: nombre + ' lleva ' + horas + ' h con un mensaje sin responder: «' + trunc(c.ultimo_mensaje || '', 80) + '»',
          created_at: c.ultimo_mensaje_en });
      }
    }
  }
  return alertas;
}

function conciergeClients(db, opts) {
  ensureSchema(db);
  const rows = safe(() => db.prepare(
    `SELECT u.id, u.email, u.plan, u.plan_status, p.business_name, p.ig_username
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE COALESCE(u.concierge, 0) = 1 ORDER BY u.id ASC`).all(), []);
  return rows.map((r) => {
    const uid = r.id;
    const lastUser = safe(() => db.prepare(
      `SELECT text, created_at FROM chat_messages WHERE user_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1`).get(uid), null);
    const lastAct = safe(() => db.prepare(
      `SELECT action, detalle, created_at FROM support_team_log WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(uid), null);
    const caso = safe(() => db.prepare(
      `SELECT * FROM support_cases WHERE user_id = ? AND tipo = 'conserje' AND estado <> 'cerrado' ORDER BY id DESC LIMIT 1`).get(uid), null);
    const openCases = safe(() => db.prepare(
      `SELECT COUNT(*) AS c FROM support_cases WHERE user_id = ? AND estado <> 'cerrado'`).get(uid), { c: 0 });
    const pendientes = pendingCountFor(db, uid);
    return {
      user_id: uid, email: r.email || '', plan: r.plan || '', plan_status: r.plan_status || '',
      business_name: r.business_name || '', ig_username: r.ig_username || '',
      concierge: true,
      ultimo_mensaje: lastUser ? lastUser.text : '',
      ultimo_mensaje_en: lastUser ? lastUser.created_at : null,
      mensajes_pendientes: pendientes,
      pendiente: pendientes > 0,
      caso_conserje: caso ? { numero: caso.id, estado: caso.estado, siguiente_paso: caso.siguiente_paso || '' } : null,
      casos_abiertos: (openCases && openCases.c) || 0,
      ultima_actividad: lastAct ? { action: lastAct.action, etiqueta: ACTION_LABELS[lastAct.action] || lastAct.action, detalle: lastAct.detalle, created_at: lastAct.created_at } : null,
      // Panel v2: foto, posteo de hoy, feed, mañana y próximos (solo si
      // el llamador lo pide — el cron de pendientes no lo necesita).
      ...((opts || {}).detalle ? panelClientExtraSafe(db, uid, opts) : {}),
    };
  });
}

// Aviso al operador (lo consulta el cron de bamboo): solo los clientes
// en modo conserje con mensajes del cliente sin respuesta real.
function pendingConcierge(db, opts) {
  ensureSchema(db);
  const all = conciergeClients(db, opts);
  const pendientes = all.filter((c) => c.pendiente).map((c) => ({
    user_id: c.user_id, business_name: c.business_name, ig_username: c.ig_username, email: c.email,
    ultimo_mensaje: c.ultimo_mensaje, ultimo_mensaje_en: c.ultimo_mensaje_en,
    mensajes_pendientes: c.mensajes_pendientes,
    caso_id: c.caso_conserje ? c.caso_conserje.numero : null,
  }));
  return { ok: true, generado_en: nowUtc(), pendientes, total: pendientes.length };
}

// La mañana del conserje: el ritual de hoy (recomendado + alternativas +
// elegido) y los posteos programados para hoy en la zona de la cuenta.
function morningFor(db, uid) {
  ensureSchema(db);
  const userId = Number(uid);
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(userId), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const tz = accountTz(db, userId);
  const dayKey = dayKeyInTz(new Date(), tz);
  const rrow = safe(() => ritualManana.getRow(db, userId, dayKey), null);
  const byId = (id) => safe(() => db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(Number(id), userId), null);
  const recomendado = rrow && rrow.recommended_post_id ? byId(rrow.recommended_post_id) : null;
  const altIds = rrow ? safe(() => JSON.parse(rrow.alt_post_ids || '[]'), []) : [];
  const alternativas = (Array.isArray(altIds) ? altIds : []).map(byId).filter(Boolean);
  const elegido = rrow && rrow.picked_post_id ? byId(rrow.picked_post_id) : null;
  const scheduled = safe(() => db.prepare(
    `SELECT * FROM posts WHERE user_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC`).all(userId), []);
  const postsHoy = scheduled.filter((p) => {
    const t = toMs(p.scheduled_at);
    if (!Number.isFinite(t)) return false;
    return dayKeyInTz(new Date(t), tz) === dayKey;
  });
  const view = (p) => p ? {
    id: p.id, caption: p.caption || '', scheduled_at: p.scheduled_at || null,
    status: p.status || '', approval: p.approval || '',
    image_path: p.image_path || '', tipo: p.tipo || p.media_type || '',
    strategy_why: p.strategy_why || '',
  } : null;
  return {
    ok: true, user_id: userId, dia: dayKey, timezone: tz,
    recomendado: view(recomendado), alternativas: alternativas.map(view),
    elegido: view(elegido), posts_hoy: postsHoy.map(view),
  };
}

// Confirmar la mañana del conserje: queda en el registro con los
// posteos y las horas. Si viene mensaje, se envía como Posty (también
// queda en el registro como respuesta). Los posteos ya salen por la
// programación vigente: acá no se publica nada.
function confirmMorning(db, uid, opts) {
  ensureSchema(db);
  const o = opts || {};
  const m = morningFor(db, uid);
  if (!m.ok) return m;
  const horas = m.posts_hoy.map((p) => '#' + p.id + ' ' + String(p.scheduled_at || '').slice(11, 16)).join(', ');
  logTeamAction(db, { actor: o.actor || 'equipo', action: 'envio_manana', userId: Number(uid),
    detalle: 'Mañana del ' + m.dia + ' confirmada: ' + (m.posts_hoy.length
      ? (m.posts_hoy.length === 1 ? '1 posteo — ' : m.posts_hoy.length + ' posteos — ') + horas + '.' : 'sin posteos programados para hoy.') });
  let enviado = null;
  const mensaje = String(o.mensaje || '').trim();
  if (mensaje) {
    const r = replyAsPosty(db, Number(uid), mensaje, { actor: o.actor || 'equipo' });
    if (r.ok) enviado = { id: r.id, case_id: r.case_id };
  }
  return { ok: true, dia: m.dia, posts: m.posts_hoy, enviado };
}

// Acción genérica del operador (foto mejorada, posteo creado, video
// premium...): solo registra — no ejecuta nada. La clave es corta y
// segura; el detalle lleva lo que se hizo.
function logOperatorAction(db, uid, action, opts) {
  ensureSchema(db);
  const o = opts || {};
  const key = String(action || '').trim().slice(0, 40);
  if (!/^[a-z0-9_]+$/.test(key)) return { ok: false, error: 'accion_invalida' };
  const user = safe(() => db.prepare('SELECT id FROM users WHERE id = ?').get(Number(uid)), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const r = logTeamAction(db, { actor: o.actor || 'equipo', action: key, userId: Number(uid),
    postId: o.postId != null ? Number(o.postId) : null,
    caseId: o.caseId != null ? Number(o.caseId) : null,
    detalle: trunc(o.detalle || '', 1000) });
  return { ok: true, id: r.id };
}

// Panel del dueño: clientes en conserje, necesidades abiertas, el
// REGISTRO real de actividad del operador y la Bandeja (casos abiertos
// cuyo dueño es Valentino). Todo de la DB; sin dato, vacío — nunca
// inventado.
function buildOwnerPanel(db, opts) {
  ensureSchema(db);
  const o = opts || {};
  const limit = Math.min(Math.max(Number(o.limit) || 100, 1), 200);
  // Panel v2: los clientes vienen enriquecidos (foto, posteo de hoy, feed,
  // mañana, próximos). El resto de la forma no cambia.
  const clientes = conciergeClients(db, { ...o, detalle: true });
  const alertas = panelAlerts(db, clientes);
  const proximosPosteos = [];
  for (const c of clientes) {
    for (const p of (c.proximos || [])) {
      proximosPosteos.push({ ...p, user_id: c.user_id, business_name: c.business_name || c.email || '' });
    }
  }
  proximosPosteos.sort((a, b) => (toMs(a.scheduled_at) || Infinity) - (toMs(b.scheduled_at) || Infinity));
  const necesidades = listCases(db, { estado: 'abierto', limit: 50 })
    .sort((a, b) => ((a.tipo === 'conserje' ? 0 : 1) - (b.tipo === 'conserje' ? 0 : 1)) || (b.id - a.id));
  const rows = safe(() => db.prepare(
    `SELECT l.*, u.email, p.business_name, p.ig_username
     FROM support_team_log l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN profiles p ON p.user_id = l.user_id
     ORDER BY l.id DESC LIMIT ?`).all(limit), []);
  const registro = rows.map((r) => ({
    id: r.id, actor: r.actor || 'equipo', action: r.action || '',
    etiqueta: ACTION_LABELS[r.action] || r.action || '',
    user_id: r.user_id, post_id: r.post_id, case_id: r.case_id,
    business_name: r.business_name || '', ig_username: r.ig_username || '', email: r.email || '',
    detalle: r.detalle || '', created_at: r.created_at || '',
  }));
  const bandeja = safe(() => db.prepare(
    `SELECT c.*, u.email, p.business_name, p.ig_username FROM support_cases c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN profiles p ON p.user_id = c.user_id
     WHERE c.estado <> 'cerrado' AND LOWER(TRIM(c.dueno)) IN (${OWNER_NAMES.map(() => '?').join(',')})
     ORDER BY c.id DESC`).all(...OWNER_NAMES), [])
    .map((c) => ({ ...c, numero: c.id }));
  return {
    ok: true, generado_en: nowUtc(),
    contadores: {
      clientes_conserje: clientes.length,
      con_pendientes: clientes.filter((c) => c.pendiente).length,
      necesidades_abiertas: necesidades.length,
      bandeja: bandeja.length,
      acciones_30d: (safe(() => db.prepare(
        `SELECT COUNT(*) AS c FROM support_team_log WHERE datetime(created_at) >= datetime('now', '-30 days')`).get(), { c: 0 }).c) || 0,
    },
    clientes, necesidades, registro, bandeja,
    // Panel v2: alertas reales (vacío = nada que alertar) y próximos
    // posteos de todos los clientes, ordenados por fecha.
    alertas, proximos_posteos: proximosPosteos.slice(0, 20),
  };
}

module.exports = {
  ensureSchema, openCase, getCase, listCases, addEvent, setOwner, setNextStep,
  closeCase, reopenCase, logTeamAction, teamLog,
  scanAlerts, refreshCaseStates, buildJourney, buildOverview, luzFor, accountTz,
  reschedulePost, redoPost, replyAsPosty,
  isConcierge, setConcierge, divertToConcierge, conciergeClients, pendingConcierge,
  morningFor, confirmMorning, logOperatorAction, buildOwnerPanel,
  CONCIERGE_ACK, ACTION_LABELS,
  CASE_TYPES, FUNNEL_STEPS,
};
