// test-lote-filtro-dias-pasados.js — MICRO-LOTE FILTRO DE DÍAS PASADOS
// (regla de Valentino 16/11 04:09: «los posteos que ya pasaron el día no
// deberían aparecer más en el conserje»). La cola de revisión del
// conserje (revisión de la noche + modo foco, GET
// /api/admin/support/conserje/revision → colaRevision) lleva SOLO posteos
// cuyo día programado es hoy o futuro, en la zona de la CUENTA. Un
// posteo cuyo día pasó sale de la cola aunque nunca se haya revisado ni
// publicado; su destino se lee en la semana/feed del cliente.
// Causa localizada por el liberador del CONSERJE (v1122): en
// posteoDeManana la rama programada exigía dayKey == fecha, pero la rama
// de propuesta (borrador con foto, ORDER BY id DESC LIMIT 1) no aplicaba
// ningún criterio de fecha — un borrador con fecha vieja entraba como
// propuesta mostrando «dom 8/11» / «dom 1/11» con atención=true.
// Pins: programado vencido fuera · borrador vencido fuera (formas 8/11 y
// 1/11 de la captura viva) · borrador de hoy entra · programado de mañana
// entra · borrador sin fecha entra · el borrador vencido más nuevo no
// tapa al fresco que sigue · la atención de un vencido no cuenta · el
// mismo filtro con la fecha explícita de mañana · la semántica es el día
// local de la cuenta (no el del dueño).
// DB scratch en memoria; fechas relativas al ahora real.
// Uso: node test-lote-filtro-dias-pasados.js — sale 0 si todo pasa.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const { dayKeyInTz } = require('./morning-post-push');
const rev = require('./conserje-revision');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const NOW = new Date();
const OWNER_TZ = 'America/New_York';
const HOY = dayKeyInTz(NOW, OWNER_TZ);
function shift(ymd, n) {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), 12));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const MANANA = shift(HOY, 1);
const MENOS8 = shift(HOY, -8);   // la forma «dom 8/11» de la captura
const MENOS15 = shift(HOY, -15); // la forma «dom 1/11» de la captura
const MENOS3 = shift(HOY, -3);
const MENOS2 = shift(HOY, -2);
function slot(fecha, hh, tz) { return rev.wallToUtc(fecha + ' ' + String(hh).padStart(2, '0') + ':00', tz || OWNER_TZ); }

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT DEFAULT '', plan TEXT DEFAULT '', plan_status TEXT DEFAULT 'active', publishing_stopped INTEGER DEFAULT 0, concierge INTEGER NOT NULL DEFAULT 0, best_hour INTEGER DEFAULT 19, trial_ends_at INTEGER, created_at TEXT DEFAULT '2026-10-01 00:00:00');
  CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '', tone TEXT DEFAULT '', description TEXT DEFAULT '');
  CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT '');
  CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source_topic TEXT DEFAULT '', week_key TEXT DEFAULT '', strategy_why TEXT DEFAULT '', error TEXT DEFAULT '', tipo TEXT DEFAULT '', user_stopped INTEGER DEFAULT 0, created_at TEXT DEFAULT '2026-10-20 00:00:00', published_at TEXT);
  CREATE TABLE support_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, tipo TEXT DEFAULT '', estado TEXT DEFAULT 'abierto', siguiente_paso TEXT DEFAULT '', titulo TEXT DEFAULT '', dedup_key TEXT DEFAULT '');
  CREATE TABLE support_team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT DEFAULT '', action TEXT DEFAULT '', user_id INTEGER, post_id INTEGER, case_id INTEGER, detalle TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE style_rules (user_id INTEGER, rule_key TEXT, rule_text TEXT DEFAULT '', hits INTEGER DEFAULT 0, active INTEGER DEFAULT 1, PRIMARY KEY (user_id, rule_key));
  CREATE TABLE cm_semana (user_id INTEGER NOT NULL, week_key TEXT NOT NULL, tema TEXT DEFAULT '', siembra TEXT DEFAULT '', cierre TEXT DEFAULT '', origen TEXT DEFAULT '', formatos_json TEXT DEFAULT '[]', objetivo TEXT DEFAULT '', hora_recomendada INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, week_key));
  CREATE TABLE cm_gusto (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, senal TEXT NOT NULL DEFAULT '', tema TEXT DEFAULT '', angulo TEXT DEFAULT '', formato TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (user_id, post_id, senal));
  CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT NOT NULL DEFAULT '{}', hash TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');
  CREATE TABLE health_interventions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, cause TEXT NOT NULL, play TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'abierta', created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, days_to_resolve INTEGER);
  CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

// Dueño (su zona manda la ventana; sin perfil de negocio: no es cliente).
db.prepare(`INSERT INTO users (id, email, plan, plan_status) VALUES (12, 'dueno@example.com', 'posty', 'active')`).run();
db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, ?)`).run(OWNER_TZ);

function mkClient(id, name, tz) {
  db.prepare(`INSERT INTO users (id, email, plan, plan_status) VALUES (?, ?, 'posty', 'active')`).run(id, 'c' + id + '@example.com');
  db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, 'Cafetería')`).run(id, name, 'ig' + id);
  db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`).run(id, tz || OWNER_TZ);
}
function mkPost(id, uid, status, schedIso, needsReview) {
  db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, scheduled_at, status, approval, media_type, needs_review)
    VALUES (?, ?, '/media/f.jpg', 'Posteo de prueba', ?, ?, 'pending', 'image', ?)`).run(id, uid, schedIso, status, needsReview ? 1 : 0);
}

// A1 · SOLO un borrador vencido (forma 8/11), marcado para revisar.
mkClient(801, 'A1 Borrador Vencido 8');
mkPost(9801, 801, 'draft', slot(MENOS8, 19), true);
// A2 · SOLO un borrador vencido (forma 1/11), marcado para revisar.
mkClient(802, 'A2 Borrador Vencido 15');
mkPost(9802, 802, 'draft', slot(MENOS15, 19), true);
// B · programado de mañana (el caso correcto).
mkClient(803, 'B Programado Manana');
mkPost(9803, 803, 'scheduled', slot(MANANA, 19), false);
// C · SOLO un programado vencido, nunca salió.
mkClient(804, 'C Programado Vencido');
mkPost(9804, 804, 'scheduled', slot(MENOS8, 19), false);
// D · borrador fresco sin fecha (la propuesta legítima de siempre).
mkClient(805, 'D Borrador Sin Fecha');
mkPost(9805, 805, 'draft', null, false);
// E · borrador con fecha de HOY, marcado para revisar (atención viva).
mkClient(806, 'E Borrador De Hoy');
mkPost(9806, 806, 'draft', slot(HOY, 19), true);
// F · dos borradores: el más nuevo vencido, el anterior sin fecha.
mkClient(807, 'F Vencido Sobre Fresco');
mkPost(9807, 807, 'draft', null, false);
mkPost(9808, 807, 'draft', slot(MENOS3, 19), false);
// G · borrador vencido + programado de mañana: manda el programado.
mkClient(808, 'G Vencido Y Programado');
mkPost(9809, 808, 'draft', slot(MENOS2, 19), false);
mkPost(9810, 808, 'scheduled', slot(MANANA, 19), false);
// H · cuenta en otra zona (Buenos Aires): su HOY manda, no el del dueño.
const TZ_BA = 'America/Argentina/Buenos_Aires';
const HOY_BA = dayKeyInTz(NOW, TZ_BA);
mkClient(809, 'H Borrador Hoy BA', TZ_BA);
mkPost(9811, 809, 'draft', rev.wallToUtc(HOY_BA + ' 00:30', TZ_BA), false);
// I · cuenta en Buenos Aires con borrador de SU ayer.
mkClient(810, 'I Borrador Ayer BA', TZ_BA);
mkPost(9812, 810, 'draft', rev.wallToUtc(shift(HOY_BA, -1) + ' 23:30', TZ_BA), false);

const cola = rev.colaRevision(db, {});
const byUid = {};
for (const i of (cola.items || [])) byUid[i.user_id] = i;
const sinPost = new Set((cola.sin_posteo || []).map((i) => i.user_id));
const enCola = (uid) => !!(byUid[uid] && byUid[uid].post);

console.log('FILTRO DE DÍAS PASADOS — cola de revisión (fecha ' + cola.fecha + ', hoy dueño ' + HOY + ')');
check('A1: el borrador vencido (8 días) NO entra a la cola', !enCola(801) && sinPost.has(801), JSON.stringify(byUid[801] && byUid[801].post));
check('A2: el borrador vencido (15 días) NO entra a la cola', !enCola(802) && sinPost.has(802), JSON.stringify(byUid[802] && byUid[802].post));
check('B: el programado de mañana entra como programado', enCola(803) && byUid[803].origen === 'programado' && byUid[803].post.id === 9803);
check('C: el programado vencido solo deja al cliente sin_posteo', !enCola(804) && sinPost.has(804));
check('D: el borrador sin fecha entra como propuesta', enCola(805) && byUid[805].origen === 'propuesta' && byUid[805].post.id === 9805);
check('E: el borrador de hoy entra como propuesta', enCola(806) && byUid[806].origen === 'propuesta' && byUid[806].post.id === 9806);
check('E: su atención SÍ cuenta (es un ítem vivo)', byUid[806].necesita_atencion === true);
check('F: el vencido más nuevo no tapa al fresco: entra el sin fecha', enCola(807) && byUid[807].post.id === 9807, JSON.stringify(byUid[807] && byUid[807].post));
check('G: con programado de mañana, el vencido no aparece', enCola(808) && byUid[808].post.id === 9810 && byUid[808].origen === 'programado');
check('H: el borrador de HOY en la zona de la cuenta entra', enCola(809) && byUid[809].post.id === 9811, JSON.stringify(byUid[809] && byUid[809].post));
check('I: el borrador de AYER en la zona de la cuenta NO entra', !enCola(810) && sinPost.has(810));
check('la atención de los vencidos no infla el resumen', cola.resumen.necesitan_atencion === 1, JSON.stringify(cola.resumen));
check('ningún ítem de la cola trae un posteo de día pasado', (cola.items || []).every((i) => {
  if (!i.post || !i.post.scheduled_at) return true;
  const tz = i.user_id === 809 || i.user_id === 810 ? TZ_BA : OWNER_TZ;
  const hoyCta = dayKeyInTz(NOW, tz);
  return dayKeyInTz(new Date(String(i.post.scheduled_at).replace(' ', 'T')), tz) >= hoyCta;
}));

// Con la fecha explícita de mañana (la forma en que el endpoint recibe
// el pedido de la superficie viva): el mismo filtro — los vencidos no
// entran por ninguna rama y el programado de mañana sí.
const colaExplicita = rev.colaRevision(db, { fecha: MANANA });
const byUidExp = {};
for (const i of (colaExplicita.items || [])) byUidExp[i.user_id] = i;
const sinPostExp = new Set((colaExplicita.sin_posteo || []).map((i) => i.user_id));
check('con fecha explícita de mañana, los borradores vencidos quedan fuera', !byUidExp[801] && !byUidExp[802] && sinPostExp.has(801) && sinPostExp.has(802));
check('con fecha explícita de mañana, el programado vencido no entra', !byUidExp[804] && sinPostExp.has(804));
check('con fecha explícita de mañana, el programado de mañana entra', !!(byUidExp[803] && byUidExp[803].post && byUidExp[803].post.id === 9803));

console.log(`\n${pass} ok · ${fail} mal`);
process.exit(fail ? 1 : 0);
