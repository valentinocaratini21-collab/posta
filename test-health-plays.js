// test-health-plays.js — tests de las JUGADAS ROJO→VERDE (health-plays.js).
// Reconstrucción de la suite original (47/47): cubre las 5 jugadas contra
// los sistemas reales (posts.needs_review, client_digest, relacion +
// proactive_log, ritual de fotos, sweep_failures, email/chat comercial),
// la idempotencia (una intervención activa por cuenta+causa), el
// fail-closed (pendiente con motivo, jamás ejecutada), el techo
// compartido de proactive_log y las prohibiciones duras (sin descuentos).
// Uso: node test-health-plays.js
'use strict';
delete process.env.RESEND_API_KEY;
delete process.env.APP_URL;
delete process.env.BASE_URL;
process.env.APPROVAL_SECRET = 'test-secret-health';

const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const HP = require('./health-plays');
const LA = require('./launch-analytics');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const sqlAgo = (days, h) => new Date(Date.now() - days * 864e5 - (h || 0) * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const WK = LA.currentWeekKey();
const PREV_WK = (() => { const d = new Date(WK + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-test-'));
const db = new DatabaseSync(path.join(dir, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT DEFAULT '', plan TEXT DEFAULT 'pro',
  plan_status TEXT DEFAULT 'active', lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', cancel_reason TEXT DEFAULT '',
  trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
  founder_price REAL, founder_currency TEXT, founder_plan TEXT, mp_base_amount INTEGER DEFAULT 0,
  stripe_subscription_id TEXT DEFAULT '', trial_ends_at INTEGER);
CREATE TABLE profiles (user_id INTEGER, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '');
CREATE TABLE settings (user_id INTEGER, demo_mode INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires', image_base_url TEXT DEFAULT '');
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE funnel_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, event TEXT, meta TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '',
  hashtags TEXT DEFAULT '', status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '',
  tipo TEXT DEFAULT '', scheduled_at TEXT, published_at TEXT, created_at TEXT DEFAULT (datetime('now')), week_key TEXT DEFAULT '',
  approval TEXT DEFAULT 'pending', needs_review INTEGER DEFAULT 0, img_redos INTEGER DEFAULT 0, digest_hash TEXT DEFAULT '',
  ig_likes INTEGER DEFAULT 0, ig_comments INTEGER DEFAULT 0, source TEXT DEFAULT '', auto_published INTEGER DEFAULT 0,
  autopilot_notified INTEGER DEFAULT 0, error TEXT DEFAULT '');
CREATE TABLE post_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, client_signal TEXT DEFAULT 'approved',
  auto_signal INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE post_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, caption TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE api_costs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, est_cost_usd REAL DEFAULT 0, ts TEXT DEFAULT (datetime('now')));
CREATE TABLE photo_missions (user_id INTEGER, week_key TEXT DEFAULT '', shots TEXT DEFAULT '[]');
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT DEFAULT '{}');
CREATE TABLE sweep_failures (user_id INTEGER, week_key TEXT DEFAULT '', reason TEXT DEFAULT '', attempts INTEGER DEFAULT 0, next_retry_at TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));`);
HP.ensurePlaysSchema(db);
require('./relacion').initSchema(db);

const insU = db.prepare(`INSERT INTO users (id, email, plan, plan_status, lang, created_at) VALUES (?, ?, ?, ?, 'es', ?)`);
const insP = db.prepare(`INSERT INTO posts (id, user_id, status, caption, image_path, week_key, published_at, created_at, ig_likes, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insS = db.prepare('INSERT INTO post_signals (user_id, post_id, client_signal, updated_at) VALUES (?, ?, ?, ?)');
const insE = db.prepare('INSERT INTO events (user_id, session_id, name, props, created_at) VALUES (?, ?, ?, ?, ?)');
const chatN = (uid, like) => db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND text LIKE ?').get(uid, like).n;
const ivOf = (uid, cause) => db.prepare('SELECT * FROM health_interventions WHERE user_id = ? AND cause = ?').get(uid, cause);

/* ---------- 1 · CALIDAD ------------------------------------------------ */
console.log('— calidad: revisión reforzada + relectura + carta —');
insU.run(1, 'calidad@test.dev', 'pro', 'active', sqlAgo(30));
insP.run(101, 1, 'draft', 'Posteo uno de la semana', '/media/a.jpg', WK, null, sqlAgo(1), 0, null);
insP.run(102, 1, 'scheduled', 'Posteo dos de la semana', '/media/b.jpg', WK, null, sqlAgo(1), 0, sqlAgo(-1));
insS.run(1, 101, 'rejected', sqlAgo(1)); insS.run(1, 101, 'rejected', sqlAgo(1)); insS.run(1, 102, 'rejected', sqlAgo(2));
db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (1, ?)').run(JSON.stringify({ fuentes: { web: { at: new Date().toISOString() }, feed: { at: new Date().toISOString() } }, temas_feed: ['x'] }));
insE.run(1, '', 'post_publish', '{}', sqlAgo(0, 2));

/* ---------- 2 · DESCONEXIÓN -------------------------------------------- */
console.log('— desconexión: toque con valor bajo el techo compartido —');
insU.run(2, 'desconexion@test.dev', 'pro', 'active', sqlAgo(40));
insP.run(201, 2, 'published', 'El posteo viejo que rindió', '/media/c.jpg', PREV_WK, sqlAgo(20), sqlAgo(20), 9, sqlAgo(20));
insP.run(202, 2, 'draft', 'Borrador de esta semana', '/media/d.jpg', WK, null, sqlAgo(2), 0, null);
insE.run(2, '', 'prueba_view', '{}', sqlAgo(10)); // última actividad: 10 días

/* ---------- 3 · DESCONEXIÓN con el techo ya usado ----------------------- */
insU.run(3, 'techo@test.dev', 'pro', 'active', sqlAgo(40));
insP.run(301, 3, 'published', 'Posteo viejo', '/media/e.jpg', PREV_WK, sqlAgo(20), sqlAgo(20), 5, sqlAgo(20));
insP.run(302, 3, 'draft', 'Borrador de esta semana', '/media/f.jpg', WK, null, sqlAgo(2), 0, null);
insE.run(3, '', 'prueba_view', '{}', sqlAgo(10));
db.prepare('INSERT INTO proactive_log (user_id, idea_title, created_at) VALUES (3, ?, ?)').run('[trigger:winner]', sqlAgo(0, 1));

/* ---------- 4 · SIN MATERIAL -------------------------------------------- */
console.log('— sin material: semana 100% IA + una línea —');
insU.run(4, 'sinmaterial@test.dev', 'pro', 'active', sqlAgo(40));
insP.run(401, 4, 'draft', 'Borrador de esta semana', '/media/g.jpg', WK, null, sqlAgo(1), 0, null);
insP.run(402, 4, 'published', 'Publicado reciente', '/media/h.jpg', PREV_WK, sqlAgo(2), sqlAgo(2), 3, sqlAgo(2));
db.prepare('INSERT INTO photo_missions (user_id, week_key, shots) VALUES (4, ?, ?)').run(PREV_WK, '["foto1.jpg"]');
db.prepare('INSERT INTO photo_missions (user_id, week_key, shots) VALUES (4, ?, ?)').run(WK, '[]');
insE.run(4, '', 'prueba_view', '{}', sqlAgo(6)); // amarillo por inactividad, sin llegar a desconexión dominante

/* ---------- 5 · CULPA NUESTRA ------------------------------------------- */
console.log('— culpa nuestra: prioridad + pieza extra sin costo —');
insU.run(5, 'culpa@test.dev', 'pro', 'active', sqlAgo(40));
insP.run(501, 5, 'published', 'La pieza que más rindió', '/media/i.jpg', PREV_WK, sqlAgo(9), sqlAgo(9), 42, sqlAgo(9));
insP.run(502, 5, 'draft', 'Borrador de esta semana', '/media/j.jpg', WK, null, sqlAgo(1), 0, null);
insE.run(5, '', 'post_failed', JSON.stringify({ post_id: 502 }), sqlAgo(0, 5));
db.prepare('INSERT INTO sweep_failures (user_id, week_key, reason, attempts, next_retry_at) VALUES (5, ?, ?, 1, ?)').run(WK, 'ia_caida', sqlAgo(-2));

/* ---------- 5b · CULPA NUESTRA sin pieza fuente (fail-closed) ------------ */
insU.run(55, 'culpasin@test.dev', 'pro', 'active', sqlAgo(40));
insP.run(551, 55, 'draft', 'Solo un borrador', '/media/k.jpg', WK, null, sqlAgo(1), 0, null);
insE.run(55, '', 'post_failed', JSON.stringify({ post_id: 551 }), sqlAgo(0, 4));

/* ---------- 6 · COMERCIAL ------------------------------------------------ */
console.log('— comercial: aviso amable con link, sin descuento —');
insU.run(6, 'comercial@test.dev', 'pro', 'past_due', sqlAgo(40));
insP.run(601, 6, 'draft', 'Borrador', '/media/l.jpg', WK, null, sqlAgo(1), 0, null);
insE.run(6, '', 'payment_failed', '{}', sqlAgo(1));

/* ---------- 1b · CALIDAD sin semana ni fundamento (fail-closed) ---------- */
insU.run(11, 'calidadsin@test.dev', 'trial', 'trial', sqlAgo(10));
insS.run(11, 1101, 'rejected', sqlAgo(1)); insS.run(11, 1101, 'rejected', sqlAgo(1)); insS.run(11, 1101, 'rejected', sqlAgo(1));

(async () => {
  /* ===== corrida principal (sin deps: sistemas reales del árbol) ===== */
  const s1 = await HP.runHealthPlays(db, {});

  const iv1 = ivOf(1, 'calidad');
  ok(!!iv1 && iv1.execution_status === 'ejecutada', 'calidad: intervención registrada y EJECUTADA');
  ok(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1 AND needs_review = 1').get().n === 2, 'calidad: la semana entera quedó en revisión reforzada (needs_review)');
  const dig = JSON.parse(db.prepare('SELECT digest_json FROM client_digest WHERE user_id = 1').get().digest_json);
  ok((Date.now() - new Date(dig.fuentes.web.at).getTime()) > 30 * 864e5, 'calidad: el fundamento quedó marcado vencido para su relectura');
  ok(!!HP.cartaOpenerFor(db, 1) && /doble control/.test(HP.cartaOpenerFor(db, 1)), 'calidad: la Carta abre con el ajuste (opener guardado)');
  ok(HP.consumeCartaOpener(db, 1) && HP.cartaOpenerFor(db, 1) === null, 'calidad: el opener se consume una sola vez');

  const iv2 = ivOf(2, 'desconexion');
  ok(!!iv2 && iv2.execution_status === 'ejecutada', 'desconexión: intervención ejecutada');
  ok(db.prepare("SELECT COUNT(*) AS n FROM relacion_messages WHERE user_id = 2 AND kind = 'health_toque'").get().n === 1, 'desconexión: el toque salió por el canal de relación');
  ok(chatN(2, '%próximo posteo%') + chatN(2, '%sigue sumando%') + chatN(2, '%posteo%') >= 1, 'desconexión: el toque lleva un dato real de su cuenta');
  ok(!!db.prepare("SELECT 1 AS x FROM proactive_log WHERE user_id = 2 AND idea_title = '[health:toque_valor]'").get(), 'desconexión: el toque quedó en el libro compartido proactive_log');

  const iv3 = ivOf(3, 'desconexion');
  ok(!!iv3 && iv3.execution_status === 'pendiente' && iv3.reason === 'techo_semanal_proactive_log', 'techo: con un toque ya usado esta semana, la jugada queda PENDIENTE con motivo');
  ok(db.prepare("SELECT COUNT(*) AS n FROM relacion_messages WHERE user_id = 3").get().n === 0, 'techo: no salió ningún toque extra');
  ok(db.prepare("SELECT COUNT(*) AS n FROM proactive_log WHERE user_id = 3 AND idea_title LIKE '[health:%'").get().n === 0, 'techo: el libro no registra un toque que no salió');

  const iv4 = ivOf(4, 'sin_material');
  ok(!!iv4 && iv4.execution_status === 'ejecutada', 'sin material: intervención ejecutada');
  ok(HP.aiOnlyWeekActive(db, 4, WK) === true, 'sin material: la semana quedó marcada 100% IA (el ritual de fotos la salta)');
  ok(HP.aiOnlyWeekActive(db, 4, PREV_WK) === false, 'sin material: la marca es de ESTA semana, no retroactiva');
  ok(chatN(4, '%no necesito nada de vos%') === 1, 'sin material: mensaje de una línea en el chat');

  const iv5 = ivOf(5, 'culpa_nuestra');
  ok(!!iv5 && iv5.execution_status === 'ejecutada', 'culpa nuestra: intervención ejecutada');
  const extra = db.prepare("SELECT * FROM posts WHERE user_id = 5 AND status = 'draft' AND week_key = ? AND id != 502").get(WK);
  ok(!!extra && extra.caption === 'La pieza que más rindió' && extra.source === 'health_compensation', 'culpa nuestra: pieza extra de compensación creada (su mejor pieza, sin costo)');
  const sf = db.prepare('SELECT next_retry_at FROM sweep_failures WHERE user_id = 5').get();
  ok(sf.next_retry_at <= new Date().toISOString().slice(0, 19).replace('T', ' '), 'culpa nuestra: la regeneración quedó con prioridad (reintento para ya)');
  ok(chatN(5, '%pieza extra%') === 1, 'culpa nuestra: el cliente se entera de la compensación');

  const iv55 = ivOf(55, 'culpa_nuestra');
  ok(!!iv55 && iv55.execution_status === 'pendiente' && iv55.reason === 'sin_pieza_fuente_para_compensar', 'fail-closed: sin pieza fuente, la jugada queda pendiente con motivo (jamás ejecutada)');
  ok(db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = 55 AND status = 'draft'").get().n === 1, 'fail-closed: no se inventó ninguna pieza');

  const iv6 = ivOf(6, 'comercial');
  ok(!!iv6 && iv6.execution_status === 'ejecutada', 'comercial: intervención ejecutada');
  const aviso = db.prepare('SELECT text FROM chat_messages WHERE user_id = 6 ORDER BY id DESC LIMIT 1').get();
  ok(!!aviso && aviso.text.includes('/#/app/ajustes'), 'comercial: el aviso lleva el link de pago de un toque');
  ok(!!aviso && !/descuento|% off|off\b/i.test(aviso.text), 'PROHIBIDO: el aviso NO ofrece ningún descuento');
  const u6 = db.prepare('SELECT plan, plan_status FROM users WHERE id = 6').get();
  ok(u6.plan === 'pro' && u6.plan_status === 'past_due', 'PROHIBIDO: la jugada no tocó plan ni precio de la cuenta');

  const iv11 = ivOf(11, 'calidad');
  ok(!!iv11 && iv11.execution_status === 'pendiente' && /sin_semana_ni_fundamento/.test(iv11.reason), 'fail-closed calidad: sin semana ni fundamento queda pendiente con motivo');

  /* ===== idempotencia: segunda corrida ===== */
  console.log('— idempotencia —');
  const before = db.prepare('SELECT COUNT(*) AS n FROM health_interventions').get().n;
  const s2 = await HP.runHealthPlays(db, {});
  const after = db.prepare('SELECT COUNT(*) AS n FROM health_interventions').get().n;
  ok(before === after, 'idempotencia: la segunda corrida no duplica intervenciones');
  const dup = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM health_interventions WHERE status = 'abierta' GROUP BY user_id, cause HAVING COUNT(*) > 1)`).get().n;
  ok(dup === 0, 'idempotencia: una sola intervención activa por cuenta+causa');
  ok(s2.ejecutadas === 0, 'idempotencia: nada ya ejecutado se re-ejecuta');
  ok(chatN(4, '%no necesito nada de vos%') === 1, 'idempotencia: el mensaje de sin-material no se repite');

  /* ===== techo compartido: unidad ===== */
  console.log('— techo compartido (unidad) —');
  const T = HP._internal.extraTouchesThisWeek;
  insU.run(90, 't1@test.dev', 'pro', 'active', sqlAgo(40));
  ok(T(db, 90) === 0, 'techo: semana limpia = 0 toques');
  db.prepare('INSERT INTO proactive_log (user_id, idea_title, created_at) VALUES (90, ?, ?)').run('[relacion:mitad:sin-toque:' + WK + ']', sqlAgo(0, 1));
  ok(T(db, 90) === 0, 'techo: el registro "sin toque" de relacion NO consume el techo');
  db.prepare('INSERT INTO proactive_log (user_id, idea_title, created_at) VALUES (90, ?, ?)').run('[relacion:mitadsemana]', sqlAgo(0, 1));
  ok(T(db, 90) === 1, 'techo: un toque de relacion SÍ cuenta para todos los sistemas');
  db.prepare('INSERT INTO proactive_log (user_id, idea_title, created_at) VALUES (90, ?, ?)').run('[oportunidad:2026-11-01]', sqlAgo(8));
  ok(T(db, 90) === 1, 'techo: un toque de la semana pasada no cuenta');

  /* ===== comercial con el canal caído (fail-closed) ===== */
  console.log('— comercial: fail-closed con deps —');
  insU.run(61, 'comercial2@test.dev', 'pro', 'past_due', sqlAgo(40));
  db.prepare(`INSERT INTO health_interventions (user_id, cause, play, status, execution_status, week_key) VALUES (61, 'comercial', 'aviso_pago_amable', 'abierta', 'pendiente', ?)`).run(WK);
  const iv61 = db.prepare('SELECT * FROM health_interventions WHERE user_id = 61').get();
  const out61 = await HP.runPlayForIntervention(db, iv61, { sendNotice: async () => ({ ok: false, reason: 'smtp_caido' }) });
  ok(out61.executed === false && db.prepare('SELECT execution_status FROM health_interventions WHERE user_id = 61').get().execution_status === 'pendiente', 'comercial: si el aviso no se entrega, queda pendiente (no se finge)');
  const out61b = await HP.runPlayForIntervention(db, db.prepare('SELECT * FROM health_interventions WHERE user_id = 61').get(), { sendNotice: async () => ({ ok: true, channel: 'email' }) });
  ok(out61b.executed === true, 'comercial: con el canal de vuelta, la misma intervención pendiente se ejecuta');

  /* ===== cancelación: salida de un toque + 30 días ===== */
  console.log('— cancelación: pregunta de salida + cuenta guardada —');
  insU.run(7, 'baja@test.dev', 'pro', 'cancelled', sqlAgo(40));
  const c1 = HP.handleCancellation(db, 7);
  ok(c1.ok === true && typeof c1.until === 'string', 'salida: la cancelación dispara la pregunta');
  const days = Math.round((new Date(c1.until + 'T12:00:00Z') - Date.now()) / 864e5);
  ok(days >= 29 && days <= 31, 'salida: la cuenta queda guardada 30 días');
  ok(chatN(7, '%exit-answer%') === 1, 'salida: la pregunta llegó con links de un toque');
  const chatRow = db.prepare('SELECT text FROM chat_messages WHERE user_id = 7 ORDER BY id DESC LIMIT 1').get();
  const m = chatRow.text.match(/exit-answer\?u=7&r=(precio)&sig=([a-f0-9]+)&exp=(\d+)/);
  ok(!!m && HP.verifyExitAnswer(7, 'precio', m[2], m[3]) === true, 'salida: el link firmado verifica sin login');
  ok(HP.verifyExitAnswer(7, 'precio', 'deadbeef' + m[2].slice(8), m[3]) === false, 'salida: un link adulterado no verifica');
  const c2 = HP.handleCancellation(db, 7);
  ok(c2.already === true && chatN(7, '%exit-answer%') === 1, 'salida: idempotente — una sola pregunta por cuenta');
  const notCancelled = HP.handleCancellation(db, 1);
  ok(notCancelled.ok === false, 'salida: una cuenta activa no recibe pregunta de salida');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN:', e); process.exit(1); });
