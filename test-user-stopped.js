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

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
