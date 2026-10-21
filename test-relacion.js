// test-relacion.js — toques de relación de Posty (mandato Valentino 2026-10-21):
// bienvenida inteligente al volver + toque de mitad de semana condicionado.
// Uso: node test-relacion.js   (corre desde la raíz del repo)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const R = require('./relacion');
const I = R._internal;

let fails = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-rel-'));
const db = new DatabaseSync(path.join(TMP, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT, plan_status TEXT, lang TEXT DEFAULT 'es');
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT 'otro');
CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires');
CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT DEFAULT '{}');
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, status TEXT, caption TEXT DEFAULT '', media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '', created_at TEXT, scheduled_at TEXT, published_at TEXT, ig_likes INTEGER DEFAULT 0, ig_comments INTEGER DEFAULT 0, client_photo INTEGER DEFAULT 0);
CREATE TABLE comment_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, ig_comment_id TEXT UNIQUE, status TEXT DEFAULT 'pending', created_at TEXT);
CREATE TABLE dm_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, ig_message_id TEXT UNIQUE, status TEXT DEFAULT 'pending', created_at TEXT);
CREATE TABLE posty_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, week_key TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at TEXT);
CREATE TABLE proactive_asks (user_id INTEGER, kind TEXT, created_at TEXT);
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT);`);
R.initSchema(db);
R.initSchema(db); // idempotente
ok(true, 'initSchema corre dos veces sin romper');

const TZ = 'America/Argentina/Buenos_Aires';
const sql = I.sqlUtc;
const H = 3600000, D = 86400000;
const NOW = new Date(); // hoy es miércoles 2026-10-21 (ART) en el entorno de test
const ymdHoy = I.localYmd(TZ, NOW);
ok(I.dowOf(ymdHoy) === 3, 'el día de test es miércoles en la tz del cliente (' + ymdHoy + ')');

function mkUser(id, lang) {
  db.prepare("INSERT INTO users (id, email, plan, plan_status, lang) VALUES (?, ?, 'esencial', 'active', ?)").run(id, 'u' + id + '@t', lang || 'es');
  db.prepare('INSERT INTO profiles (user_id, business_name) VALUES (?, ?)').run(id, 'Negocio ' + id);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(id);
  db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (?, ?)').run(id, JSON.stringify({ rubro: 'mueblería', nombre: 'Negocio ' + id }));
}
// Marca la "visita de ayer" (baseline) sin disparar nada.
function visitaAyer(id) {
  const ayer = new Date(NOW.getTime() - D);
  R.entryForUser(db, id, ayer);
}

/* ---------- 1 · primera entrada CON novedad → saludo -------------------- */
mkUser(1);
visitaAyer(1);
db.prepare("INSERT INTO comment_queue (user_id, ig_comment_id, status, created_at) VALUES (1, 'c1', 'pending', ?)").run(sql(new Date(NOW.getTime() - 2 * H)));
let r = R.entryForUser(db, 1, NOW);
ok(!!(r.welcome && r.welcome.kind === 'comentario_pendiente'), 'con comentario pendiente nuevo: saluda por eso');
ok(r.welcome && /comentario/.test(r.welcome.text) && !/¡|¿/.test(r.welcome.text) && r.welcome.text === r.welcome.text.toLowerCase(),
  'el saludo usa la voz de chat (minúscula, sin signos de apertura): "' + (r.welcome || {}).text + '"');
const chatRow = db.prepare("SELECT text FROM chat_messages WHERE user_id = 1 AND role = 'assistant'").get();
ok(!!chatRow && chatRow.text === r.welcome.text, 'el saludo también queda en el hilo del chat');
const logRow = db.prepare("SELECT 1 AS x FROM proactive_log WHERE user_id = 1 AND idea_title = '[relacion:bienvenida]'").get();
ok(!!logRow, 'la bienvenida se registra en el libro compartido (proactive_log)');

/* ---------- 2 · segunda entrada del mismo día → nada --------------------- */
r = R.entryForUser(db, 1, new Date(NOW.getTime() + H));
ok(r.welcome === null, 'segunda entrada del día: no repite el saludo');

/* ---------- 3 · primera entrada SIN novedad → nada (silencio) ------------ */
mkUser(2);
visitaAyer(2);
r = R.entryForUser(db, 2, NOW);
ok(r.welcome === null && r.pending.length === 0, 'sin novedad desde la última visita: no aparece nada');

/* ---------- 4 · prioridad: comentario > semana lista --------------------- */
mkUser(3);
visitaAyer(3);
db.prepare("INSERT INTO comment_queue (user_id, ig_comment_id, status, created_at) VALUES (3, 'c3', 'pending', ?)").run(sql(new Date(NOW.getTime() - H)));
db.prepare("INSERT INTO posts (user_id, status, caption, created_at, scheduled_at) VALUES (3, 'scheduled', 'Sillón nuevo en el local', ?, ?)").run(sql(new Date(NOW.getTime() - 3 * H)), sql(new Date(NOW.getTime() + 2 * D)));
r = R.entryForUser(db, 3, NOW);
ok(!!(r.welcome && r.welcome.kind === 'comentario_pendiente'), 'con comentario y semana lista a la vez: va UNA sola novedad, la más importante');

/* ---------- 5 · semana lista sola → su saludo ---------------------------- */
mkUser(4);
visitaAyer(4);
db.prepare("INSERT INTO posts (user_id, status, caption, created_at, scheduled_at) VALUES (4, 'scheduled', 'Mesa ratona de roble en stock', ?, ?)").run(sql(new Date(NOW.getTime() - 3 * H)), sql(new Date(NOW.getTime() + D)));
r = R.entryForUser(db, 4, NOW);
ok(!!(r.welcome && r.welcome.kind === 'semana_lista' && /semana ya quedó lista/.test(r.welcome.text)), 'semana lista: "' + (r.welcome || {}).text + '"');

/* ---------- 6 · fail-closed sin fundamento -------------------------------- */
db.prepare("INSERT INTO users (id, email, plan, plan_status) VALUES (5, 'u5@t', 'esencial', 'active')").run();
db.prepare('INSERT INTO settings (user_id) VALUES (5)').run();
db.prepare("INSERT INTO comment_queue (user_id, ig_comment_id, status, created_at) VALUES (5, 'c5', 'pending', ?)").run(sql(new Date(NOW.getTime() - H)));
R.entryForUser(db, 5, new Date(NOW.getTime() - D)); // baseline
r = R.entryForUser(db, 5, NOW);
ok(r.welcome === null, 'sin fundamento (client_digest): fail-closed, no saluda aunque haya novedad');

/* ---------- 7 · espejo EN ------------------------------------------------- */
mkUser(6, 'en');
visitaAyer(6);
db.prepare("INSERT INTO comment_queue (user_id, ig_comment_id, status, created_at) VALUES (6, 'c6', 'pending', ?)").run(sql(new Date(NOW.getTime() - H)));
r = R.entryForUser(db, 6, NOW);
ok(!!(r.welcome && /^hi!/.test(r.welcome.text)), 'cliente EN: saludo en inglés ("' + (r.welcome || {}).text + '")');

/* ---------- 8 · techo DIARIO: un trigger de hoy bloquea ------------------- */
mkUser(7);
visitaAyer(7);
db.prepare("INSERT INTO comment_queue (user_id, ig_comment_id, status, created_at) VALUES (7, 'c7', 'pending', ?)").run(sql(new Date(NOW.getTime() - H)));
db.prepare('INSERT INTO proactive_log (user_id, idea_title, created_at) VALUES (7, ?, ?)').run('[trigger:winner]', sql(new Date(NOW.getTime() - 30 * 60000)));
r = R.entryForUser(db, 7, NOW);
ok(r.welcome === null, 'techo diario: ya salió un toque proactivo hoy → la bienvenida no se suma');

/* ---------- 9 · techo SEMANAL ~4 sumando rituales ------------------------- */
mkUser(8);
visitaAyer(8);
const ayerSql = sql(new Date(NOW.getTime() - 26 * H));
db.prepare('INSERT INTO posty_questions (user_id, created_at) VALUES (8, ?)').run(ayerSql);
db.prepare("INSERT INTO proactive_asks (user_id, kind, created_at) VALUES (8, 'fotos', ?)").run(ayerSql);
db.prepare('INSERT INTO proactive_log (user_id, idea_title, created_at) VALUES (8, ?, ?)').run('[trigger:streak_risk]', ayerSql);
db.prepare("INSERT INTO comment_queue (user_id, ig_comment_id, status, created_at) VALUES (8, 'c8', 'pending', ?)").run(sql(new Date(NOW.getTime() - H)));
ok(I.weeklyBudget(db, 8, TZ, ymdHoy) === 4, 'presupuesto semanal = carta(1) + pregunta(1) + fotos(1) + trigger(1) = 4');
r = R.entryForUser(db, 8, NOW);
ok(r.welcome === null, 'techo semanal lleno: la bienvenida cede (los rituales no se bloquean, ceden los toques nuevos)');

/* ---------- 10 · mitad de semana CON dato → toque ------------------------- */
mkUser(9);
const mananaYmd = I.addDaysYmd(ymdHoy, 1);
const manana14 = new Date(I.tzMidnightUtc(TZ, mananaYmd).getTime() + 14 * H);
db.prepare("INSERT INTO posts (user_id, status, caption, media_type, created_at, scheduled_at) VALUES (9, 'scheduled', 'Cómo cuidamos el cuero de cada sillón', 'video', ?, ?)").run(sql(new Date(NOW.getTime() - D)), sql(manana14));
let sw = R.sweepMidweek(db, NOW);
ok(sw.enviados === 1, 'miércoles con pieza que sale mañana: el barrido genera el toque');
const msg9 = db.prepare("SELECT * FROM relacion_messages WHERE user_id = 9 AND kind = 'mitadsemana'").get();
ok(!!msg9 && /mañana sale tu reel/.test(msg9.text), 'el toque dice el dato real: "' + (msg9 || {}).text + '"');
r = R.entryForUser(db, 9, NOW);
ok(r.pending.length === 1 && r.pending[0].id === msg9.id, 'el toque aparece en la entrada siguiente (dentro de la app, sin push)');
const seenRes = R.markSeen(db, 9, [msg9.id]);
r = R.entryForUser(db, 9, NOW);
ok(seenRes.n === 1 && r.pending.length === 0, 'al mostrarse se marca visto y no vuelve a aparecer');
sw = R.sweepMidweek(db, NOW);
ok(sw.enviados === 0, 'el barrido no duplica el toque de la semana');

/* ---------- 11 · mitad de semana: mejor del mes ---------------------------- */
mkUser(10);
const pub = (diasAtras, likes, comments, cap) => db.prepare("INSERT INTO posts (user_id, status, caption, created_at, published_at, ig_likes, ig_comments) VALUES (10, 'published', ?, ?, ?, ?, ?)").run(cap, sql(new Date(NOW.getTime() - diasAtras * D)), sql(new Date(NOW.getTime() - diasAtras * D)), likes, comments);
pub(1, 40, 5, 'El sillón que todos preguntan'); // ayer, el mejor
pub(10, 12, 1, 'Mesa de arrime en oferta');
pub(20, 8, 0, 'Rincón de lectura de la semana');
sw = R.sweepMidweek(db, NOW);
const msg10 = db.prepare("SELECT * FROM relacion_messages WHERE user_id = 10 AND kind = 'mitadsemana'").get();
ok(!!msg10 && /mejor del mes/.test(msg10.text) && /de ayer/.test(msg10.text), 'mejor del mes (publicado ayer): "' + (msg10 || {}).text + '"');

/* ---------- 12 · mitad de semana SIN dato → "sin toque" (éxito) ----------- */
mkUser(11);
sw = R.sweepMidweek(db, NOW);
const msg11 = db.prepare("SELECT * FROM relacion_messages WHERE user_id = 11").get();
const sinToque = db.prepare("SELECT 1 AS x FROM proactive_log WHERE user_id = 11 AND idea_title LIKE '[relacion:mitad:sin-toque:%'").get();
ok(!msg11 && !!sinToque, 'sin dato verdadero: no se envía nada y queda registrado como "sin toque"');
const sw2 = R.sweepMidweek(db, NOW);
ok(sw2.sin_toque === 0, 'el "sin toque" no se registra dos veces en la semana');

/* ---------- 13 · fuera de ventana (lunes) no hay barrido ------------------- */
mkUser(12);
const lunes = new Date(NOW.getTime() - 2 * D);
db.prepare("INSERT INTO posts (user_id, status, caption, media_type, created_at, scheduled_at) VALUES (12, 'scheduled', 'Reel del taller', 'video', ?, ?)").run(sql(new Date(NOW.getTime() - 3 * D)), sql(new Date(NOW.getTime() + D)));
sw = R.sweepMidweek(db, lunes);
ok(sw.revisados === 0 && sw.enviados === 0, 'fuera de miércoles/jueves el barrido no genera toques');

console.log(`\n${total - fails}/${total} tests OK`);
process.exit(fails ? 1 : 0);
