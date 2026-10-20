// test-user-stopped.js — Regresión del bug 2026-10-20: los flujos automáticos
// (regla 24h, sweep semanal, pipeline, login/signup) re-programaban posteos
// que el dueño había FRENADO a propósito. La marca posts.user_stopped es el
// contrato: se setea en todo freno deliberado, se limpia solo cuando el
// usuario mismo programa/acepta, y el embudo automático (scheduleAllDrafts)
// jamás toca un posteo marcado.
// Uso: node test-user-stopped.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const server = fs.readFileSync(__dirname + '/server.js', 'utf8');
const sched = fs.readFileSync(__dirname + '/scheduler.js', 'utf8');
const dbjs = fs.readFileSync(__dirname + '/db.js', 'utf8');

// ---------- 1) Contrato en el código fuente ----------
check('db.js migra posts.user_stopped', dbjs.includes("ALTER TABLE posts ADD COLUMN user_stopped INTEGER DEFAULT 0"));
check('Frenar (PATCH unschedule) marca user_stopped=1', server.includes("approval='pending', user_stopped=1 WHERE id=?"));
check('Pasar a manual (autopilot off) marca user_stopped=1', server.includes("approval='pending', user_stopped=1\n          WHERE user_id = ? AND status = 'scheduled'"));
check('stop-publishing admin marca user_stopped=1', server.includes("scheduled_at = NULL, user_stopped = 1 WHERE user_id = ? AND status = 'scheduled'"));
check('scheduleAllDrafts excluye marcados', server.includes("COALESCE(user_stopped,0)=0 AND COALESCE(image_path,'') != ''"));
check('PATCH programar limpia la marca', server.includes("approval=?, user_stopped=0 WHERE id=?"));
check('acceptAllDrafts limpia la marca', server.includes("error='', user_stopped=0 WHERE id=?"));
check('schedule-all (explícito) limpia la marca', server.includes("notified=0, user_stopped=0 WHERE id=?"));
check('scheduler 24h: SELECT de usuarios excluye marcados', sched.includes("COALESCE(p.user_stopped, 0) = 0"));
check('scheduler 24h: conteo stale excluye marcados', sched.includes("AND COALESCE(user_stopped, 0) = 0\n            AND created_at < datetime('now', '-24 hours')"));

// ---------- 2) Comportamiento: la query REAL del embudo contra fixtures ----------
// Se extrae el SQL exacto de scheduleAllDrafts desde server.js (si cambia la
// query, el test corre la nueva: el contrato es el COALESCE de la marca).
const m = server.match(/function scheduleAllDrafts\(uid\) \{[\s\S]*?db\.prepare\(`(SELECT \* FROM posts[^`]*)`\)\.all\(uid\)/);
check('query del embudo extraíble de server.js', !!m);
if (m) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, needs_review INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0, image_path TEXT, created_at TEXT)`);
  const ins = db.prepare(`INSERT INTO posts (id, user_id, status, needs_review, user_stopped, image_path, created_at) VALUES (?,?,?,?,?,?,?)`);
  ins.run(1, 12, 'draft', 0, 1, '/m/a.jpg', '2026-10-15 10:00:00'); // frenado por el dueño
  ins.run(2, 12, 'draft', 0, 0, '/m/b.jpg', '2026-10-15 10:00:00'); // borrador viejo sin tocar
  ins.run(3, 12, 'draft', 1, 0, '/m/c.jpg', '2026-10-15 10:00:00'); // en revisión
  ins.run(4, 12, 'draft', 0, 0, '', '2026-10-15 10:00:00');          // sin imagen
  ins.run(5, 3, 'draft', 0, 1, '/m/d.jpg', '2026-10-15 10:00:00');  // frenado (otra cuenta)
  const rows = db.prepare(m[1]).all(12);
  const ids = rows.map(r => r.id);
  check('el embudo NO devuelve el posteo frenado (id 1)', !ids.includes(1), 'ids=' + ids.join(','));
  check('el embudo SÍ devuelve el borrador sin tocar (id 2)', ids.includes(2));
  check('el embudo sigue excluyendo needs_review y sin-imagen', !ids.includes(3) && !ids.includes(4));
}

// ---------- 3) v275: capa a nivel CUENTA (publishing_stopped) ----------
// La v272 falló su prueba de supervivencia en producción (2026-10-20
// 19:17 ART): el stop administrativo solo marcaba los posteos que
// desprogramaba; los que YA eran borradores quedaban sin marca y la regla
// 24h resucitó 5 de la cuenta 12. La v275 agrega: (a) el stop marca TODO
// el stock frenable, (b) la bandera users.publishing_stopped bloquea el
// embudo y la regla 24h a nivel cuenta, (c) la reanudación es del dueño.
check('db.js migra users.publishing_stopped', dbjs.includes("ALTER TABLE users ADD COLUMN publishing_stopped INTEGER DEFAULT 0"));
check('stop-publishing marca TODO el stock frenable (draft/paused/publishing)', server.includes("status IN ('draft', 'paused', 'publishing') AND COALESCE(user_stopped, 0) = 0"));
check('stop-publishing setea la bandera de cuenta', server.includes("autopilot_enabled = 0, publishing_stopped = 1 WHERE id = ?"));
check('el embudo arranca consultando la bandera', server.includes("if (publishingStopped(uid)) return { ok: false, reason: 'publishing_stopped'"));
check('scheduler 24h: SELECT de usuarios excluye cuentas frenadas', sched.includes("COALESCE(u.publishing_stopped, 0) = 0"));
check('scheduler 24h: conteo stale excluye cuentas frenadas', sched.includes("COALESCE((SELECT publishing_stopped FROM users WHERE users.id = posts.user_id), 0) = 0"));
check('scheduler: la recuperación de publishing trabados excluye cuentas frenadas', sched.includes("user_id NOT IN (SELECT id FROM users WHERE COALESCE(publishing_stopped, 0) = 1)"));
check('reactivatePausedPosts no resucita posteos marcados', server.includes("status='paused' AND COALESCE(user_stopped,0)=0"));
check('la bandera se limpia en los 4 caminos de reanudación del dueño', (server.match(/clearPublishingStopped\(/g) || []).length >= 5,
  'llamadas=' + ((server.match(/clearPublishingStopped\(/g) || []).length));

// ---------- 4) REGRESIÓN EXACTA del fallo de producción (cuenta 12) ----------
// Se ejecutan las sentencias REALES del handler stop-publishing (extraídas
// de server.js) sobre las fixtures que replican el estado de la cuenta 12
// a las 17:51 EDT: TODO en borrador (unscheduled había dado 0), posteos
// viejos sin tocar y SIN marca. Después se corren la query REAL del
// embudo y las queries REALES de la regla 24h: nada puede volver.
{
  const i0 = server.indexOf("app.post('/api/admin/stop-publishing'");
  const i1 = server.indexOf("app.post('/api/admin/regen-post'", i0);
  check('handler stop-publishing extraíble de server.js', i0 > 0 && i1 > i0);
  const handlerSrc = server.slice(i0, i1 > i0 ? i1 : i0 + 3000);
  const stopSqls = [...handlerSrc.matchAll(/db\.prepare\((`[^`]*`|'[^']*')\)/g)].map((x) => x[1].slice(1, -1));
  check('el stop ejecuta 3 UPDATEs (desprograma + marca + bandera)', stopSqls.length === 3, 'n=' + stopSqls.length);

  const armSlice = sched.slice(sched.indexOf('async function autoArmStaleDrafts'), sched.indexOf('async function autoArmStaleDrafts') + 2600);
  const q24users = (armSlice.match(/SELECT DISTINCT p\.user_id AS id FROM posts p[\s\S]*?`\)\.all\(\)/) || [])[0];
  const mStale = armSlice.match(/SELECT COUNT\(\*\) AS n FROM posts[\s\S]*?`\)\.get\(u\.id\)/);
  check('queries de la regla 24h extraíbles de scheduler.js', !!q24users && !!mStale);
  const qFunnel = (server.match(/function scheduleAllDrafts\(uid\) \{[\s\S]*?db\.prepare\(`(SELECT \* FROM posts[^`]*)`\)\.all\(uid\)/) || [])[1];

  if (stopSqls.length === 3 && q24users && mStale && qFunnel) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, autopilot_enabled INTEGER DEFAULT 1, auto_week INTEGER DEFAULT 1, publishing_stopped INTEGER DEFAULT 0)`);
    db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, scheduled_at TEXT, needs_review INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0, image_path TEXT, created_at TEXT)`);
    const insU = db.prepare('INSERT INTO users (id) VALUES (?)');
    const insP = db.prepare(`INSERT INTO posts (id, user_id, status, scheduled_at, user_stopped, image_path, created_at) VALUES (?,?,?,NULL,0,'/m/x.jpg',?)`);
    const stale = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    insU.run(12); insU.run(99);
    // Cuenta 12 como estaba a las 17:51 EDT: borradores viejos SIN marca.
    insP.run(409, 12, 'draft', stale); insP.run(410, 12, 'draft', stale);
    insP.run(411, 12, 'draft', stale); insP.run(413, 12, 'draft', stale);
    insP.run(414, 12, 'draft', stale);
    insP.run(420, 12, 'scheduled', stale); // uno programado (control del desprogramado)
    insP.run(421, 12, 'paused', stale);    // uno pausado por trial
    // Cuenta 99 (control): mismo borrador viejo, jamás frenada.
    insP.run(901, 99, 'draft', stale);

    // ANTES del stop: el embudo ve los borradores de la 12 (el hueco v272).
    const before = db.prepare(qFunnel).all(12).map((r) => r.id);
    check('ANTES del stop el embudo veía los 5 borradores (el hueco)', [409, 410, 411, 413, 414].every((id) => before.includes(id)), 'ids=' + before.join(','));

    // EL FRENO (las 3 sentencias reales, en orden, como el handler).
    for (const sql of stopSqls) db.prepare(sql).run(12);
    const after = db.prepare('SELECT * FROM posts WHERE user_id = 12').all();
    check('tras el stop, TODO el stock de la 12 lleva la marca', after.every((p) => p.user_stopped === 1),
      'sin marca: ' + after.filter((p) => !p.user_stopped).map((p) => p.id).join(','));
    check('el que estaba programado volvió a borrador sin fecha', (() => { const p = after.find((p) => p.id === 420); return p.status === 'draft' && p.scheduled_at === null; })());
    check('la bandera de cuenta quedó en 1', db.prepare('SELECT publishing_stopped FROM users WHERE id = 12').get().publishing_stopped === 1);

    // LA BARRIDA: embudo + regla 24h con la cuenta frenada.
    check('el embudo NO devuelve NADA de la cuenta frenada', db.prepare(qFunnel).all(12).length === 0);
    const selUsers = db.prepare(q24users.replace(/`\)\.all\(\)$/, '')).all().map((r) => r.id);
    check('la regla 24h NO selecciona a la cuenta frenada', !selUsers.includes(12), 'users=' + selUsers.join(','));
    check('la regla 24h SÍ selecciona a la cuenta control (99)', selUsers.includes(99));
    const staleN = db.prepare(mStale[0].replace(/`\)\.get\(u\.id\)$/, '')).get(12).n;
    check('el conteo stale de la cuenta frenada es 0', staleN === 0, 'n=' + staleN);
    check('el embudo de la cuenta control sigue viendo su borrador', db.prepare(qFunnel).all(99).map((r) => r.id).includes(901));

    // LA REANUDACIÓN del dueño: limpia la bandera y la marca de UN posteo
    // (lo que hace PATCH programar con ese posteo) → lo automático vuelve.
    db.prepare('UPDATE users SET publishing_stopped = 0 WHERE id = 12').run();
    db.prepare('UPDATE posts SET user_stopped = 0 WHERE id = 409').run();
    const resumed = db.prepare(qFunnel).all(12).map((r) => r.id);
    check('tras reanudar, el embudo ve el posteo liberado y solo ese', resumed.length === 1 && resumed[0] === 409, 'ids=' + resumed.join(','));
  }
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
