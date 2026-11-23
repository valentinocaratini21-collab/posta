// test-lote-push-sin-este-posteo.js — LOTE PUSH-SIN-ESTE-POSTEO (22/11):
// el cuerpo del push del freno de 30 minutos abre con la cita, sin la
// muletilla «este posteo:» delante (palabra del dueño al verlo en su
// teléfono: «"Este posteo" esta de mas en lo que dice la push»).
//
// Qué afirma esta suite, ejercitando el emisor real (upcoming-notice.js)
// con pushFn capturador y DB sqlite en memoria:
//   1. Posteo en piloto automático → body EXACTO «"<cap>..." — tocá para
//      verlo o frenarlo» (la cita abre el cuerpo; el corte «....» se
//      conserva tal como el emisor lo compone cuando el caption termina
//      en punto) y título «🚀 Publico en 30 min» intacto.
//   2. Posteo en modo manual → body EXACTO «"<cap>..." — tocá para
//      aprobarlo o frenarlo» y título «⏰ Sale en 30 minutos» intacto.
//   3. Las historias NO se tocan (arreglo deliberado v856: la historia se
//      nombra historia para que no se lea como el posteo del feed): sus
//      cuerpos quedan byte-idénticos a la base.
//   4. Cierre de clase: ningún archivo emisor de push del servidor
//      contiene ya el patrón censado («este posteo:» / «tu posteo:» /
//      «this post:» / «your post:» delante de una cita).
//   5. La URL del toque no cambia (/#/app/semana?post=<id>).
//
// Control: la misma suite contra la base prístina FALLA en 1, 2 y el
// grep de cierre (4) — exactamente la superficie del lote — y pasa las
// historias (3), los títulos y la URL (5), que no cambian.
// Uso: node test-lote-push-sin-este-posteo.js
'use strict';
process.env.APPROVAL_SECRET = 'test-secret';
delete process.env.APP_URL;
delete process.env.BASE_URL;

const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const sqlIn = (min) => new Date(Date.now() + min * 60000).toISOString().slice(0, 19).replace('T', ' ');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-sin-este-posteo-'));
const db = new DatabaseSync(path.join(dir, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'pro', plan_status TEXT DEFAULT 'active',
  lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE settings (user_id INTEGER, demo_mode INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/New_York', image_base_url TEXT DEFAULT '');
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '',
  image_path TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'scheduled', approval TEXT DEFAULT 'pending',
  auto_published INTEGER DEFAULT 0, autopilot_notified INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0,
  media_type TEXT DEFAULT 'image', created_at TEXT DEFAULT (datetime('now')), published_at TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`);

const UN = require('./upcoming-notice');

const insU = db.prepare(`INSERT INTO users (id, email, trust_level, autopilot_prenotify, client_name) VALUES (?, ?, ?, ?, ?)`);
const insS = db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
const insP = db.prepare(`INSERT INTO posts (id, user_id, caption, image_path, scheduled_at, approval, auto_published, autopilot_notified, media_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

// Usuario autopiloto (trust 1) y usuario manual (trust 0).
insU.run(1, 'auto@test.dev', 1, 0, 'Negocio Auto');
insS.run(1, 'America/New_York');
insU.run(2, 'manual@test.dev', 0, 0, 'Negocio Manual');
insS.run(2, 'America/New_York');

// El caption del caso del dueño: primera línea «Esto es Posty: tus
// community managers.» — termina en punto, así el corte del emisor
// («<cap>...») produce las cuatro «....» de su captura.
const CAP = 'Esto es Posty: tus community managers.\nsegunda línea que no va';
insP.run(742, 1, CAP, '/media/pelicula.mp4', sqlIn(30), 'pending', 1, 0, 'video'); // autopilot, posteo
insP.run(743, 2, CAP, '/media/foto.jpg', sqlIn(30), 'pending', 0, 0, 'image');     // manual, posteo
insP.run(744, 1, CAP, '/media/historia.jpg', sqlIn(30), 'pending', 1, 0, 'story'); // autopilot, historia
insP.run(745, 2, CAP, '/media/historia2.jpg', sqlIn(30), 'pending', 0, 0, 'story'); // manual, historia

(async () => {
  const sent = [];
  const pushFn = async (uid, payload) => { sent.push({ uid, payload }); return { ok: true, sent: 1 }; };
  // emailFn sin canal: el aviso ya llegó por push y eso es lo que se mide.
  const r = await UN.processUpcomingNotices(db, { pushFn, emailFn: async () => ({ ok: false, reason: 'sin_email', transient: false }) });
  ok(r.push === 4, `los 4 avisos salieron por push (push=${r.push})`);
  const byPost = {};
  for (const s of sent) { const m = /post=(\d+)/.exec(s.payload.url || ''); if (m) byPost[m[1]] = s.payload; }

  console.log('— el caso del dueño: posteo, piloto automático —');
  const auto = byPost[742] || {};
  ok(auto.title === '🚀 Publico en 30 min', `título intacto: ${JSON.stringify(auto.title)}`);
  ok(auto.body === '"Esto es Posty: tus community managers...." — tocá para verlo o frenarlo',
    `body EXACTO sin muletilla: ${JSON.stringify(auto.body)}`);
  ok(auto.url === '/#/app/semana?post=742', `el toque sigue yendo a la semana del posteo: ${auto.url}`);

  console.log('— posteo, modo manual —');
  const man = byPost[743] || {};
  ok(man.title === '⏰ Sale en 30 minutos', `título intacto: ${JSON.stringify(man.title)}`);
  ok(man.body === '"Esto es Posty: tus community managers...." — tocá para aprobarlo o frenarlo',
    `body EXACTO sin muletilla: ${JSON.stringify(man.body)}`);

  console.log('— historias: byte-intactas (v856 las nombra a propósito) —');
  const stA = byPost[744] || {};
  ok(stA.body === 'esta historia: "Esto es Posty: tus community managers...." — tocá para verla o frenarla',
    `historia autopilot sin cambios: ${JSON.stringify(stA.body)}`);
  const stM = byPost[745] || {};
  ok(stM.body === 'esta historia: "Esto es Posty: tus community managers...." — tocá para aprobarla o frenarla',
    `historia manual sin cambios: ${JSON.stringify(stM.body)}`);

  console.log('— cierre de clase: el patrón no queda en ningún emisor —');
  const EMISORES = ['upcoming-notice.js', 'notify-push.js', 'trial-day-push.js', 'morning-post-push.js',
    'bandeja.js', 'scheduler.js', 'server.js', 'wins.js', 'dogfood.js', 'magia-postpago.js',
    'alerta-despegue.js', 'proactive.js', 'push-oficina.js', 'gesty-agenda.js', 'gesty-cierre-dia.js',
    'integridad-prepublicacion.js'];
  const PATRON = /(este posteo|tu posteo|this post|your post)\s*:\s*["“]/i;
  let sucios = [];
  for (const f of EMISORES) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    if (PATRON.test(src)) sucios.push(f);
  }
  ok(sucios.length === 0, `ningún emisor contiene «<rótulo>: "<cita>"» (sucios: ${sucios.join(', ') || 'ninguno'})`);

  console.log(`\nRESULTADO: ${pass} ok · ${fail} MAL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
