// relacion.js — TOQUES DE RELACIÓN DE POSTY (2026-10-21, mandato de Valentino:
// "que Posty le hable al cliente cuando tiene algo para decir").
//
// Dos toques nuevos, diseñados con Valentino y aprobados tal cual:
//
//  A. BIENVENIDA INTELIGENTE AL VOLVER: cuando el cliente entra a la app,
//     Posty lo saluda SOLO si hay una novedad verdadera desde su última
//     visita (un comentario espera su ok · su semana quedó lista · hoy se
//     publica algo · un posteo rindió el doble de su promedio). Reglas:
//     máximo en el primer ingreso del día (tz del cliente); si no hay
//     novedad NO aparece nada — el silencio es parte del diseño; vive
//     DENTRO de la app (burbuja de chat arriba de la Agenda/Inicio) y trae
//     UN dato o propuesta concreta, nunca un "¿necesitás algo?" vacío.
//     Si hay varias novedades, va la más importante, una sola.
//
//  B. TOQUE DE MITAD DE SEMANA CONDICIONADO: un solo mensaje el miércoles
//     o jueves (tz del cliente) que SOLO se genera si existe un dato
//     concreto y verdadero (su posteo reciente ya es el mejor del mes ·
//     mañana sale una pieza suya). Si no hay dato, no se envía y queda
//     registrado como "sin toque" — eso es ÉXITO, no una falla.
//
//  Canal de ambos: SOLO dentro de la app (burbuja en la Agenda + queda en
//  el hilo del chat). NUNCA push: el push queda reservado a lo que ya
//  existe (carta del domingo, aviso de publicación, aprobaciones, problemas).
//
//  TECHOS GLOBALES (coordinados con TODOS los sistemas proactivos):
//   · Máximo 1 mensaje proactivo por día: si hoy ya salió un trigger de
//     proactive.js o un toque de relación, no sale otro.
//   · ~4 por semana sumando todo: el presupuesto semanal cuenta la carta
//     del domingo (ritual fijo), la pregunta de Posty pregunta, el pedido
//     de fotos y todo lo registrado en proactive_log. Los rituales viejos
//     no se bloquean desde acá: los que ceden son estos dos toques.
//  El libro compartido es proactive_log (idea_title con prefijos
//  '[relacion:...]'), el mismo que usa proactive.js para sus triggers.
//
//  Alcance: clientes PAGOS activos (plan_status='active', plan real) CON
//  fundamento (client_digest). Fail-closed: sin fundamento no hay toques.
//  Regla de verdad: cada texto nace de datos reales de SU cuenta
//  (comment_queue/dm_queue, posts, métricas ig_likes/ig_comments).
//  Voz: la de chat aprobada en v305 (minúscula, sin signos de apertura).

'use strict';

/* ---------------- utilidades de fecha (mismo patrón que visibility.js) -- */
function localYmd(tz, d) {
  const dt = d || new Date();
  try { return dt.toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); }
  catch (e) { return dt.toISOString().slice(0, 10); }
}
function mondayOf(ymd) {
  const p = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function dowOf(ymd) { // 0=domingo … 6=sábado, sobre la fecha local (ymd)
  const p = String(ymd || '').split('-').map(Number);
  return new Date(Date.UTC(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12)).getUTCDay();
}
function addDaysYmd(ymd, n) {
  const p = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function sqlUtc(d) { return d.toISOString().slice(0, 19).replace('T', ' '); }
// Medianoche local (tz) de un ymd → instante UTC. Iterativo (DST-safe a la hora).
function tzMidnightUtc(tz, ymd) {
  const p = String(ymd || '').split('-').map(Number);
  const target = Date.UTC(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 0, 0, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const loc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: tz || 'UTC' }));
    const locAsUtc = Date.UTC(loc.getFullYear(), loc.getMonth(), loc.getDate(), loc.getHours(), loc.getMinutes(), loc.getSeconds());
    const diff = target - locAsUtc;
    if (!diff) break;
    guess += diff;
  }
  return new Date(guess);
}
function dayRangeUtc(tz, ymd) {
  const s = tzMidnightUtc(tz, ymd);
  return [sqlUtc(s), sqlUtc(new Date(s.getTime() + 86400000))];
}
function weekRangeUtc(tz, ymd) {
  const s = tzMidnightUtc(tz, mondayOf(ymd));
  return [sqlUtc(s), sqlUtc(new Date(s.getTime() + 7 * 86400000))];
}
function userTz(db, userId) {
  try {
    const r = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(userId);
    return (r && r.timezone) || 'America/Argentina/Buenos_Aires';
  } catch (e) { return 'America/Argentina/Buenos_Aires'; }
}
function stripOpen(t) { return String(t == null ? '' : t).replace(/^\s*[¡¿]+/, '').trimStart(); }

/* ---------------- schema ------------------------------------------------- */
function initSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS relacion_state (
    user_id INTEGER PRIMARY KEY,
    last_seen_at TEXT DEFAULT '',
    last_seen_day TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS relacion_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    ref_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    seen_at TEXT DEFAULT ''
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_relacion_msg_user ON relacion_messages(user_id, status, id)`);
  // El libro compartido de toques proactivos (lo crea proactive.js en prod;
  // acá es defensivo, mismo patrón que logTrigger).
  db.exec(`CREATE TABLE IF NOT EXISTS proactive_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    idea_title TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

/* ---------------- elegibilidad: pago activo + fundamento ----------------- */
function eligible(db, userId) {
  try {
    const u = db.prepare('SELECT plan, plan_status, lang FROM users WHERE id = ?').get(userId);
    if (!u || u.plan_status !== 'active' || !u.plan || u.plan === '' || u.plan === 'free') return null;
    let dj = null;
    try {
      const d = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
      if (d && d.digest_json) dj = JSON.parse(d.digest_json);
    } catch (e) {}
    if (!dj || typeof dj !== 'object') return null;
    if (!String(dj.rubro || dj.nombre || dj.categoria || '').trim()) return null;
    return { lang: u.lang === 'en' ? 'en' : 'es' };
  } catch (e) { return null; }
}

/* ---------------- techos: el libro compartido ---------------------------- */
function logTouch(db, userId, key) {
  try { db.prepare('INSERT INTO proactive_log (user_id, idea_title) VALUES (?, ?)').run(userId, key); } catch (e) {}
}
function dailyTouchExists(db, userId, tz, ymd) {
  try {
    const [s, e] = dayRangeUtc(tz, ymd);
    const r = db.prepare(`SELECT 1 AS x FROM proactive_log WHERE user_id = ?
      AND created_at >= ? AND created_at < ?
      AND (idea_title LIKE '[trigger:%' OR idea_title LIKE '[relacion:%' OR idea_title LIKE '[oportunidad:%')
      LIMIT 1`).get(userId, s, e);
    return !!r;
  } catch (e) { return false; }
}
// Presupuesto de la semana (lunes a domingo, tz del cliente): carta (ritual
// fijo, 1) + pregunta (si ya se hizo esta semana) + pedido de fotos (si ya
// se hizo) + todo lo que el libro registre esta semana.
function weeklyBudget(db, userId, tz, ymd) {
  let n = 1; // la carta del domingo siempre cuenta: cierra la semana
  const [ws, we] = weekRangeUtc(tz, ymd);
  try {
    const q = db.prepare('SELECT 1 AS x FROM posty_questions WHERE user_id = ? AND created_at >= ? AND created_at < ? LIMIT 1').get(userId, ws, we);
    if (q) n += 1;
  } catch (e) {}
  try {
    const f = db.prepare("SELECT 1 AS x FROM proactive_asks WHERE user_id = ? AND kind = 'fotos' AND created_at >= ? AND created_at < ? LIMIT 1").get(userId, ws, we);
    if (f) n += 1;
  } catch (e) {}
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM proactive_log WHERE user_id = ?
      AND created_at >= ? AND created_at < ?
      AND (idea_title LIKE '[trigger:%' OR idea_title LIKE '[relacion:%' OR idea_title LIKE '[oportunidad:%')`).get(userId, ws, we);
    if (r) n += r.n || 0;
  } catch (e) {}
  return n;
}
const WEEKLY_CAP = 4;

/* ---------------- textos (voz de chat v305; dato real o nada) ------------ */
function temaDe(caption) {
  const lines = String(caption || '').split('\n').map(s => s.trim()).filter(Boolean);
  for (const ln of lines) {
    const t = ln.replace(/^[\s#@\p{Extended_Pictographic}]+/u, '').trim();
    if (t.length >= 8 && !/^https?:/i.test(t)) return t.slice(0, 48).replace(/\s+$/, '');
  }
  return '';
}
function horaLocal(sqlUtcText, tz) {
  try {
    const d = new Date(String(sqlUtcText).replace(' ', 'T') + 'Z');
    return d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}
const TXT = {
  pendingComments: (n, lang) => lang === 'en'
    ? (n > 1 ? `hi! 💙 you have ${n} comments waiting for your ok. want to go through them together and reply?` : 'hi! 💙 you have a new comment waiting for your ok. want to look at it together and reply?')
    : (n > 1 ? `hola! 💙 tenés ${n} comentarios esperando tu ok. los vemos y los respondemos juntos?` : 'hola! 💙 tenés un comentario nuevo esperando tu ok. lo vemos y lo respondemos juntos?'),
  pendingDm: (n, lang) => lang === 'en'
    ? (n > 1 ? `hi! 💙 you have ${n} messages waiting for your ok. want to go through them together?` : 'hi! 💙 you have a new message waiting for your ok. want to look at it together?')
    : (n > 1 ? `hola! 💙 tenés ${n} mensajes esperando tu ok. los vemos juntos?` : 'hola! 💙 tenés un mensaje nuevo esperando tu ok. lo vemos juntos?'),
  weekReady: (lang) => lang === 'en'
    ? 'hi! 💙 your week is all set: it goes out on its own, as always. want a quick look first?'
    : 'hola! 💙 tu semana ya quedó lista: sale sola, como siempre. querés darle una mirada antes?',
  publishesToday: (hora, tema, lang) => lang === 'en'
    ? `hi! 💙 today's post goes out at ${hora}${tema ? ` — "${tema}"` : ''}. all set on this side.`
    : `hola! 💙 hoy sale tu posteo a las ${hora}${tema ? ` — "${tema}"` : ''}. todo listo de este lado.`,
  topPerformer: (tema, likes, comments, lang) => lang === 'en'
    ? `hi! 💙 your post${tema ? ` "${tema}"` : ''} crushed it: ${likes} likes, more than double your average. want to make more like that?`
    : `hola! 💙 tu posteo${tema ? ` "${tema}"` : ''} la rompió: ${likes} likes, más del doble de tu promedio. hacemos más así?`,
  midBest: (cuando, likes, comments, lang) => lang === 'en'
    ? `midweek, and good news 💙 your post from ${cuando === 'ayer' ? 'yesterday' : 'this week'} is already your best of the month: ${likes} likes and ${comments} comments. it's working.`
    : `mitad de semana y una linda noticia 💙 tu posteo de ${cuando} ya es el mejor del mes: ${likes} likes y ${comments} comentarios. viene funcionando, eh?`,
  midTomorrow: (pieza, tema, lang) => lang === 'en'
    ? `tomorrow your ${pieza} goes out 💙${tema ? ` "${tema}".` : ''} if you want to change anything, there's still time.`
    : `mañana sale tu ${pieza} 💙${tema ? ` "${tema}".` : ''} si querés cambiar algo, todavía estamos a tiempo.`,
};
const PIEZA = {
  es: { video: 'reel', carousel: 'carrusel', image: 'posteo' },
  en: { video: 'reel', carousel: 'carousel post', image: 'post' },
};

/* ---------------- A. bienvenida: novedades desde la última visita -------- */
function pickNovelty(db, userId, sinceSql, tz, ymd, now, lang) {
  const dayS = dayRangeUtc(tz, ymd)[0];
  // 1 · comentarios / DMs esperando su aprobación (alguien está esperando).
  // Cada cola con su propio try: si una tabla faltara, la otra igual cuenta.
  let c = 0, m = 0;
  try {
    const rc = db.prepare("SELECT COUNT(*) AS n FROM comment_queue WHERE user_id = ? AND status = 'pending' AND created_at > ?").get(userId, sinceSql);
    if (rc) c = rc.n || 0;
  } catch (e) {}
  try {
    const rm = db.prepare("SELECT COUNT(*) AS n FROM dm_queue WHERE user_id = ? AND status = 'pending' AND created_at > ?").get(userId, sinceSql);
    if (rm) m = rm.n || 0;
  } catch (e) {}
  if (c > 0) return { kind: 'comentario_pendiente', text: TXT.pendingComments(c, lang) };
  if (m > 0) return { kind: 'mensaje_pendiente', text: TXT.pendingDm(m, lang) };
  // 2 · su semana quedó lista (piezas programadas nuevas desde la visita).
  try {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'scheduled'
      AND created_at > ? AND (scheduled_at IS NULL OR scheduled_at >= ?)`).get(userId, sinceSql, dayS);
    if (r && r.n > 0) return { kind: 'semana_lista', text: TXT.weekReady(lang) };
  } catch (e) {}
  // 3 · hoy se publica algo (la próxima salida de hoy, con su hora real).
  try {
    const [s, e] = dayRangeUtc(tz, ymd);
    const r = db.prepare(`SELECT caption, scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled'
      AND scheduled_at >= ? AND scheduled_at < ? AND scheduled_at > ?
      ORDER BY scheduled_at ASC LIMIT 1`).get(userId, s, e, sqlUtc(now));
    if (r) return { kind: 'publica_hoy', text: TXT.publishesToday(horaLocal(r.scheduled_at, tz), temaDe(r.caption), lang) };
  } catch (e) {}
  // 4 · un posteo rindió el doble de su promedio (misma vara que proactive).
  try {
    const w = db.prepare(`SELECT caption, ig_likes, ig_comments FROM posts
      WHERE user_id = ? AND status = 'published' AND published_at > ?
        AND published_at > datetime('now', '-7 days')
        AND (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) > 0
      ORDER BY (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) DESC LIMIT 1`).get(userId, sinceSql);
    if (w) {
      const avg = db.prepare(`SELECT AVG(COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) AS a
        FROM posts WHERE user_id = ? AND status = 'published'
        AND published_at > datetime('now', '-30 days') AND published_at < datetime('now', '-48 hours')`).get(userId);
      const eng = (w.ig_likes || 0) + (w.ig_comments || 0) * 3;
      const a = (avg && avg.a) || 0;
      if (a > 0 && eng >= a * 2) return { kind: 'posteo_winner', text: TXT.topPerformer(temaDe(w.caption), w.ig_likes || 0, w.ig_comments || 0, lang) };
    }
  } catch (e) {}
  return null;
}

function getState(db, userId) {
  try { return db.prepare('SELECT * FROM relacion_state WHERE user_id = ?').get(userId) || null; }
  catch (e) { return null; }
}
function touchVisit(db, userId, now, ymd) {
  const at = sqlUtc(now);
  try {
    db.prepare(`INSERT INTO relacion_state (user_id, last_seen_at, last_seen_day, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
        last_seen_day = excluded.last_seen_day, updated_at = excluded.updated_at`).run(userId, at, ymd, at);
  } catch (e) {}
}
function chatInsert(db, userId, text) {
  try { db.prepare("INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)").run(userId, text); } catch (e) {}
}

// Entrada a la app: decide la bienvenida, devuelve los mensajes de relación
// pendientes (mitad de semana) y registra la visita. El cliente la llama al
// pintar Inicio/Agenda; la bienvenida sale como máximo en el primer ingreso
// del día y todo queda gateado por los techos globales.
function entryForUser(db, userId, nowOverride) {
  initSchema(db);
  const now = nowOverride || new Date();
  const tz = userTz(db, userId);
  const ymd = localYmd(tz, now);
  const state = getState(db, userId);
  const firstEver = !state;
  const prevSeenAt = (state && state.last_seen_at) || '';
  const firstOfDay = !state || state.last_seen_day !== ymd;
  let welcome = null;
  const elig = eligible(db, userId);
  if (!firstEver && firstOfDay && elig) {
    const nov = pickNovelty(db, userId, prevSeenAt, tz, ymd, now, elig.lang);
    if (nov && !dailyTouchExists(db, userId, tz, ymd) && weeklyBudget(db, userId, tz, ymd) < WEEKLY_CAP) {
      const text = stripOpen(nov.text);
      welcome = { kind: nov.kind, text };
      logTouch(db, userId, '[relacion:bienvenida]');
      chatInsert(db, userId, text);
    }
  }
  let pending = [];
  try {
    pending = db.prepare(`SELECT id, kind, text FROM relacion_messages
      WHERE user_id = ? AND status = 'pending' ORDER BY id ASC LIMIT 2`).all(userId);
  } catch (e) {}
  touchVisit(db, userId, now, ymd);
  return { ok: true, welcome, pending };
}

function markSeen(db, userId, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(n => n > 0).slice(0, 10);
  if (!list.length) return { ok: true, n: 0 };
  let n = 0;
  try {
    const st = db.prepare("UPDATE relacion_messages SET status = 'seen', seen_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'pending'");
    for (const id of list) { const r = st.run(id, userId); if (r && r.changes) n++; }
  } catch (e) {}
  return { ok: true, n };
}

/* ---------------- B. mitad de semana: el dato o el silencio -------------- */
function midweekData(db, userId, tz, ymd, lang) {
  // a · su posteo reciente ya es el mejor del mes (con piso de muestra real).
  try {
    const rows = db.prepare(`SELECT caption, ig_likes, ig_comments, published_at FROM posts
      WHERE user_id = ? AND status = 'published' AND published_at > datetime('now', '-30 days')
        AND (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) > 0
      ORDER BY (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) DESC LIMIT 1`).all(userId);
    const cnt = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at > datetime('now', '-30 days')`).get(userId);
    const best = rows && rows[0];
    if (best && cnt && cnt.n >= 3) {
      const pubDay = localYmd(tz, new Date(String(best.published_at).replace(' ', 'T') + 'Z'));
      const recent = pubDay >= addDaysYmd(ymd, -3) && pubDay <= ymd;
      if (recent) {
        const cuando = pubDay === addDaysYmd(ymd, -1) ? 'ayer' : 'esta semana';
        return { kind: 'mejor_del_mes', text: TXT.midBest(cuando, best.ig_likes || 0, best.ig_comments || 0, lang) };
      }
    }
  } catch (e) {}
  // b · mañana sale una pieza suya (la primera de mañana, con su tema).
  try {
    const [s, e] = dayRangeUtc(tz, addDaysYmd(ymd, 1));
    const r = db.prepare(`SELECT caption, media_type FROM posts WHERE user_id = ? AND status = 'scheduled'
      AND scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at ASC LIMIT 1`).get(userId, s, e);
    if (r) {
      const pieza = (PIEZA[lang] && PIEZA[lang][r.media_type]) || (lang === 'en' ? 'post' : 'posteo');
      return { kind: 'sale_manana', text: TXT.midTomorrow(pieza, temaDe(r.caption), lang) };
    }
  } catch (e) {}
  return null;
}

function sweepMidweek(db, nowOverride) {
  initSchema(db);
  const now = nowOverride || new Date();
  const out = { revisados: 0, enviados: 0, sin_toque: 0, diferidos: 0 };
  let users = [];
  try {
    users = db.prepare(`SELECT id FROM users WHERE plan_status = 'active'
      AND plan IS NOT NULL AND plan != '' AND plan != 'free'`).all();
  } catch (e) { return out; }
  for (const u of users) {
    try {
      const elig = eligible(db, u.id);
      if (!elig) continue;
      const tz = userTz(db, u.id);
      const ymd = localYmd(tz, now);
      const dow = dowOf(ymd);
      if (dow !== 3 && dow !== 4) continue; // miércoles o jueves, su hora local
      out.revisados++;
      const monday = mondayOf(ymd);
      const yaMsg = db.prepare("SELECT 1 AS x FROM relacion_messages WHERE user_id = ? AND kind = 'mitadsemana' AND ref_key = ? LIMIT 1").get(u.id, monday);
      if (yaMsg) continue;
      const yaSin = db.prepare('SELECT 1 AS x FROM proactive_log WHERE user_id = ? AND idea_title = ? LIMIT 1').get(u.id, `[relacion:mitad:sin-toque:${monday}]`);
      if (yaSin) continue;
      const data = midweekData(db, u.id, tz, ymd, elig.lang);
      if (!data) {
        logTouch(db, u.id, `[relacion:mitad:sin-toque:${monday}]`);
        out.sin_toque++;
        continue;
      }
      // Techos: si hoy/semana ya están cargados, se difiere (queda para el
      // próximo barrido dentro de la ventana mié/jue; si la ventana pasa,
      // no se fuerza: el silencio también es el diseño).
      if (dailyTouchExists(db, u.id, tz, ymd) || weeklyBudget(db, u.id, tz, ymd) >= WEEKLY_CAP) { out.diferidos++; continue; }
      const text = stripOpen(data.text);
      db.prepare(`INSERT INTO relacion_messages (user_id, kind, text, ref_key, status)
        VALUES (?, 'mitadsemana', ?, ?, 'pending')`).run(u.id, text, monday);
      logTouch(db, u.id, '[relacion:mitadsemana]');
      chatInsert(db, u.id, text);
      out.enviados++;
    } catch (e) {}
  }
  return out;
}

function startRelacionJobs(db) {
  const run = () => { try { sweepMidweek(db); } catch (e) {} };
  const t0 = setTimeout(run, 60000); if (t0.unref) t0.unref();
  const iv = setInterval(run, 30 * 60 * 1000); if (iv.unref) iv.unref();
}

/* ---------------- endpoints ---------------------------------------------- */
function registerRelacion(app, db, guards) {
  const express = require('express');
  const json = express.json();
  const requireAuth = guards && guards.requireAuth;
  const requireAdminToken = guards && guards.requireAdminToken;

  app.get('/api/relacion/entry', requireAuth, (req, res) => {
    try { res.json(entryForUser(db, req.session.userId)); }
    catch (e) { res.json({ ok: true, welcome: null, pending: [] }); }
  });

  app.post('/api/relacion/seen', requireAuth, json, (req, res) => {
    try { res.json(markSeen(db, req.session.userId, (req.body || {}).ids)); }
    catch (e) { res.json({ ok: true, n: 0 }); }
  });

  if (requireAdminToken) {
    app.get('/api/admin/relacion/state', requireAdminToken, (req, res) => {
      const counts = {};
      try {
        for (const r of db.prepare('SELECT kind, status, COUNT(*) AS n FROM relacion_messages GROUP BY kind, status').all()) {
          counts[`${r.kind}:${r.status}`] = r.n;
        }
      } catch (e) {}
      let log = [];
      try {
        log = db.prepare(`SELECT user_id, idea_title, created_at FROM proactive_log
          WHERE idea_title LIKE '[relacion:%' ORDER BY id DESC LIMIT 100`).all();
      } catch (e) {}
      res.json({ ok: true, cap_diario: 1, cap_semanal: WEEKLY_CAP,
        nota: 'Toques de relación de Posty: bienvenida inteligente al volver + toque de mitad de semana condicionado. Solo dentro de la app, nunca push. Los "sin toque" registrados son éxito del diseño (no había dato verdadero que decir).',
        counts, log });
    });

    app.post('/api/admin/relacion/midweek-sweep', requireAdminToken, json, (req, res) => {
      try { res.json({ ok: true, ...sweepMidweek(db) }); }
      catch (e) { res.status(500).json({ ok: false, error: 'sweep_failed' }); }
    });
  }
}

module.exports = {
  initSchema,
  registerRelacion,
  startRelacionJobs,
  entryForUser,
  markSeen,
  sweepMidweek,
  _internal: {
    localYmd, mondayOf, dowOf, addDaysYmd, sqlUtc, tzMidnightUtc, dayRangeUtc, weekRangeUtc,
    userTz, stripOpen, eligible, dailyTouchExists, weeklyBudget, pickNovelty, midweekData, WEEKLY_CAP,
  },
};
