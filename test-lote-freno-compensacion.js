// test-lote-freno-compensacion.js — LOTE FRENO-COMPENSACION: la vía de
// la compensación automática respeta el FRENO de la cuenta propia.
//
// Escenario fundante (22/11, 19:01–19:43 EST): el posteo 742 de la casa
// falló en Meta («Meta no pudo procesar el video») y la salud de la
// cuenta ejecutó su jugada de compensación (intervención 59, causa
// culpa_nuestra) creando el posteo 743: un CLON de la mejor pieza ya
// publicada de la cuenta. El FRENO-CUENTA-PROPIA (v1188) frena la
// generación automática por las rutas conocidas, pero la compensación
// entraba por otra puerta: health-plays.js insertaba el clon directo
// en posts, sin pasar por ninguna guarda.
//
// Contrato nuevo que afirma esta suite:
//  · Sobre la cuenta frenada, la compensación NO crea, clona ni
//    regenera piezas — ni sin deps (como corre producción) ni con un
//    generador inyectado: la pieza extra queda como PROPUESTA para la
//    mano humana (efecto pieza_extra_propuesta) y la parte no
//    generadora (prioridad de regeneración + aviso veraz) sí corre.
//  · La clase entera: NINGUNA jugada de la salud crea posteos sobre
//    la cuenta frenada (las 5 causas ejercidas una por una).
//  · En cuentas no frenadas muere el clon para todos: la pieza extra
//    nace solo del generador inyectado (pieza nueva, no copia) y sin
//    generador la jugada queda pendiente, fail-closed.
// Uso: node test-lote-freno-compensacion.js
'use strict';
delete process.env.RESEND_API_KEY;
delete process.env.APP_URL;
delete process.env.BASE_URL;
delete process.env.HOUSE_USER_IDS; // manda el default del producto: '12'
process.env.APPROVAL_SECRET = 'test-secret-freno-comp';

const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const HP = require('./health-plays');
const LA = require('./launch-analytics');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const sqlAgo = (days, h) => new Date(Date.now() - days * 864e5 - (h || 0) * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const WK = LA.currentWeekKey();
const PREV_WK = (() => { const d = new Date(WK + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); })();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freno-comp-'));
const db = new DatabaseSync(path.join(dir, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT DEFAULT '', plan TEXT DEFAULT 'pro',
  plan_status TEXT DEFAULT 'active', lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', cancel_reason TEXT DEFAULT '',
  ig_username TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
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
const insProf = db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)`);
const insP = db.prepare(`INSERT INTO posts (id, user_id, status, caption, image_path, week_key, published_at, created_at, ig_likes, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insIv = db.prepare(`INSERT INTO health_interventions (user_id, cause, play, status, execution_status, week_key) VALUES (?, ?, ?, 'abierta', 'pendiente', ?)`);
const postsN = (uid) => db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid).n;
const chatN = (uid, like) => db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND text LIKE ?').get(uid, like).n;
const ivRow = (uid, cause) => db.prepare('SELECT * FROM health_interventions WHERE user_id = ? AND cause = ?').get(uid, cause);

/* ---------- LA CASA (id 12, la forma REAL de su fila: trial/trial) ------ */
insU.run(12, 'casa@test.dev', 'trial', 'trial', sqlAgo(58));
insProf.run(12, 'Posty', 'posty.communitymanager');
insP.run(1201, 12, 'published', 'Esto es Posty: tus community managers', '/media/pelicula.jpg', PREV_WK, sqlAgo(2), sqlAgo(2), 100, sqlAgo(2));
insP.run(1202, 12, 'failed', 'La película que Meta no procesó', '/media/pelicula2.mp4', WK, null, sqlAgo(0, 3), 0, sqlAgo(0, 2));
insP.run(1203, 12, 'draft', 'Borrador de la semana de la casa', '/media/casa.jpg', WK, null, sqlAgo(1), 0, null);
db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (12, ?)').run(JSON.stringify({ fuentes: { web: { at: new Date().toISOString() }, feed: { at: new Date().toISOString() } } }));
db.prepare('INSERT INTO sweep_failures (user_id, week_key, reason, attempts, next_retry_at) VALUES (12, ?, ?, 1, ?)').run(WK, 'meta_no_proceso_el_video', sqlAgo(-2));
insIv.run(12, 'culpa_nuestra', 'compensacion', WK);
insIv.run(12, 'calidad', 'revision_reforzada', WK);
insIv.run(12, 'desconexion', 'toque_valor', WK);
insIv.run(12, 'sin_material', 'semana_ia_total', WK);
insIv.run(12, 'comercial', 'aviso_pago_amable', WK);

/* ---------- LA CASA por su IG en inglés (id 77, fuera de la lista) ------ */
insU.run(77, 'casa-en@test.dev', 'trial', 'trial', sqlAgo(58));
insProf.run(77, 'Posty EN', 'postycommunitymanager');
insP.run(7701, 77, 'published', 'This is Posty: your community managers', '/media/film.jpg', PREV_WK, sqlAgo(2), sqlAgo(2), 80, sqlAgo(2));
insIv.run(77, 'culpa_nuestra', 'compensacion', WK);

/* ---------- CLIENTES (no frenados) --------------------------------------- */
insU.run(5, 'cliente@test.dev', 'pro', 'active', sqlAgo(40));
insProf.run(5, 'Cliente', 'cliente.cinco');
insP.run(501, 5, 'published', 'La mejor del cliente', '/media/cliente.jpg', PREV_WK, sqlAgo(9), sqlAgo(9), 42, sqlAgo(9));
insIv.run(5, 'culpa_nuestra', 'compensacion', WK);

insU.run(6, 'cliente2@test.dev', 'pro', 'active', sqlAgo(40));
insProf.run(6, 'Cliente Dos', 'cliente.seis');
insP.run(601, 6, 'published', 'La mejor del cliente dos', '/media/cliente2.jpg', PREV_WK, sqlAgo(9), sqlAgo(9), 30, sqlAgo(9));
insIv.run(6, 'culpa_nuestra', 'compensacion', WK);

(async () => {
  /* ===== A · EL ESCENARIO FUNDANTE: la casa, sin deps (como producción) == */
  console.log('— A · la casa: la compensación tras el fallo, sin deps (producción) —');
  const outA = await HP.runPlayForIntervention(db, ivRow(12, 'culpa_nuestra'), {});
  ok(outA.executed === true, 'A: la compensación de la casa se ejecuta en su parte no generadora');
  ok(postsN(12) === 3, 'A: NINGÚN posteo nuevo sobre la cuenta frenada (siguen sus 3 sembrados)');
  ok(db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = 12 AND source = 'health_compensation'").get().n === 0, 'A: ningún posteo de compensación creado');
  ok(db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = 12 AND status = 'draft' AND caption = 'Esto es Posty: tus community managers'").get().n === 0, 'A: ningún CLON de su mejor pieza publicada');
  const prop = HP._internal.getEffect(db, 12, 'pieza_extra_propuesta', WK);
  ok(!!prop && prop.payload && prop.payload.source_post_id === 1201 && prop.payload.estado === 'propuesta_mano_humana', 'A: la pieza extra quedó como PROPUESTA para la mano humana (efecto con la referencia a su mejor pieza)');
  ok(!!HP._internal.getEffect(db, 12, 'regen_prioridad', WK), 'A: la prioridad de regeneración quedó registrada (efecto)');
  const sf12 = db.prepare('SELECT next_retry_at FROM sweep_failures WHERE user_id = 12').get();
  ok(sf12.next_retry_at <= new Date().toISOString().slice(0, 19).replace('T', ' '), 'A: los reintentos de la casa quedaron para ya (prioridad real)');
  ok(chatN(12, '%queda propuesta%') === 1, 'A: el aviso dice la verdad — la pieza queda propuesta');
  ok(chatN(12, '%te sumé una pieza extra%') === 0, 'A: el aviso NO anuncia una pieza que no se creó');
  const ivA = ivRow(12, 'culpa_nuestra');
  ok(ivA.execution_status === 'ejecutada' && /frenada/.test(ivA.detail) && /propuesta/.test(ivA.detail), 'A: la intervención declara el freno y la propuesta en su detalle');

  /* ===== B · LA CASA con generador inyectado: tampoco se crea ============ */
  console.log('— B · la casa con generador inyectado: la guarda corre antes que el generador —');
  let spyCalls = 0;
  const spyGen = async (db2, user2) => { spyCalls++; const rr = db2.prepare(`INSERT INTO posts (user_id, caption, status, source) VALUES (?, 'pieza del generador espía', 'draft', 'spy')`).run(user2.id); return { ok: true, post_id: Number(rr.lastInsertRowid) }; };
  const outB = await HP.runPlayForIntervention(db, ivRow(12, 'culpa_nuestra'), { generateExtraPiece: spyGen });
  ok(outB.executed === true && spyCalls === 0, 'B: el generador inyectado NUNCA se llama sobre la cuenta frenada');
  ok(postsN(12) === 3, 'B: sigue sin crearse ningún posteo sobre la casa');

  /* ===== C · LA CASA por su IG en inglés ================================= */
  console.log('— C · la casa identificada por su ig (fuera de la lista de ids) —');
  const outC = await HP.runPlayForIntervention(db, ivRow(77, 'culpa_nuestra'), {});
  ok(outC.executed === true && postsN(77) === 1, 'C: la cuenta con el ig de la casa (EN) también está frenada: nada se crea');
  const prop77 = HP._internal.getEffect(db, 77, 'pieza_extra_propuesta', WK);
  ok(!!prop77 && prop77.payload.source_post_id === 7701, 'C: su pieza extra también quedó propuesta');

  /* ===== D · LA CLASE ENTERA: ninguna jugada crea posteos en la casa ==== */
  console.log('— D · las demás jugadas sobre la casa: corren sin crear posteos —');
  for (const causa of ['calidad', 'desconexion', 'sin_material', 'comercial']) {
    await HP.runPlayForIntervention(db, ivRow(12, causa), {});
  }
  ok(postsN(12) === 3, 'D: tras correr las 5 jugadas, la casa sigue con sus 3 posteos — ninguna crea');
  ok(db.prepare('SELECT needs_review FROM posts WHERE id = 1203').get().needs_review === 1, 'D: la jugada de calidad sí corrió (revisión reforzada sobre lo existente, sin crear)');

  /* ===== E · CLIENTE con generador: pieza nueva, jamás clon ============= */
  console.log('— E · cliente con generador inyectado —');
  const genReal = async (db2, user2) => { const rr = db2.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, week_key, source) VALUES (?, '/media/generada.jpg', 'Pieza nueva generada para compensar', 'draft', 'image', ?, 'health_compensation')`).run(user2.id, WK); return { ok: true, post_id: Number(rr.lastInsertRowid) }; };
  const outE = await HP.runPlayForIntervention(db, ivRow(5, 'culpa_nuestra'), { generateExtraPiece: genReal });
  ok(outE.executed === true && postsN(5) === 2, 'E: la compensación del cliente se ejecuta y suma su pieza');
  const extraE = db.prepare("SELECT * FROM posts WHERE user_id = 5 AND status = 'draft'").get();
  ok(!!extraE && extraE.caption !== 'La mejor del cliente' && extraE.image_path !== '/media/cliente.jpg', 'E: la pieza extra es NUEVA — no es un clon de la publicada');
  ok(chatN(5, '%pieza extra%') === 1, 'E: el cliente se entera de la compensación');

  /* ===== F · CLIENTE sin generador: pendiente, sin clon ================= */
  console.log('— F · cliente sin generador inyectado —');
  const outF = await HP.runPlayForIntervention(db, ivRow(6, 'culpa_nuestra'), {});
  ok(outF.executed === false && outF.reason === 'pieza_extra_sin_generador', 'F: sin generador la jugada queda pendiente con motivo (fail-closed)');
  ok(postsN(6) === 1, 'F: tampoco en clientes nace un clon por la vía directa');
  ok(ivRow(6, 'culpa_nuestra').execution_status === 'pendiente', 'F: la intervención jamás se marca ejecutada');

  /* ===== G · LA GUARDA, en unidad ======================================== */
  console.log('— G · la guarda del freno —');
  const F = HP._internal.cuentaFrenada;
  ok(F(db, 12, {}) === true, 'G: el id de la casa está frenado (lista del env, default 12)');
  ok(F(db, 77, {}) === true, 'G: el ig de la casa (EN) está frenado');
  ok(F(db, 5, {}) === false, 'G: un cliente no está frenado');
  ok(F(db, 5, { deps: { cuentaFrenada: () => true } }) === true, 'G: el predicado inyectado manda (en producción es el esCuentaPropia de server.js)');
  ok(F(db, 12, { deps: { cuentaFrenada: () => false } }) === false, 'G: la inyección es la fuente de verdad cuando server.js la pasa');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN:', e); process.exit(1); });
