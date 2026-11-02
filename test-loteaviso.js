// test-loteaviso.js — LOTE AVISO SOLO SI FALTA CONFIRMACIÓN + botón «i»
// Uso: node test-loteaviso.js  (desde la raíz del árbol)
// Parte servidor: upcoming-notice.eligible() — un posteo ya confirmado
// (approved/auto) o con corazón tocado (owner_liked) NO genera aviso.
// Parte cliente: botón «i» en homeHeadHTML + modal pzPubInfoHTML con
// los textos exactos ES/EN; el corazón en piloto automático deja
// constancia owner_liked (sin aprobar) para suprimir el aviso.
'use strict';
process.env.APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'test-loteaviso-secret';
delete process.env.APP_URL;
delete process.env.BASE_URL;

const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const sqlIn = (min) => new Date(Date.now() + min * 60000).toISOString().slice(0, 19).replace('T', ' ');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aviso-test-'));
const db = new DatabaseSync(path.join(dir, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'pro', plan_status TEXT DEFAULT 'active',
  lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE settings (user_id INTEGER, demo_mode INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires', image_base_url TEXT DEFAULT '');
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '',
  image_path TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'scheduled', approval TEXT DEFAULT 'pending',
  auto_published INTEGER DEFAULT 0, autopilot_notified INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0, owner_liked INTEGER DEFAULT 0,
  media_type TEXT DEFAULT 'image', created_at TEXT DEFAULT (datetime('now')), published_at TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`);

const UN = require('./upcoming-notice');
const E = UN._internal.eligible;

const insU = db.prepare(`INSERT INTO users (id, email, trust_level, autopilot_prenotify) VALUES (?, ?, ?, ?)`);
const insS = db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
const insP = db.prepare(`INSERT INTO posts (id, user_id, caption, image_path, scheduled_at, approval, auto_published, autopilot_notified, owner_liked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const notified = (pid) => db.prepare('SELECT autopilot_notified FROM posts WHERE id = ?').get(pid).autopilot_notified;

insU.run(1, 'auto@test.dev', 1, 0);
insS.run(1, 'America/New_York');
insU.run(2, 'manual@test.dev', 0, 0);
insS.run(2, 'America/Argentina/Buenos_Aires');
insU.run(3, 't2@test.dev', 2, 1);
insS.run(3, 'America/New_York');

(async () => {
  console.log('— elegibilidad: confirmado = sin aviso —');
  ok(E(db, { approval: 'approved', auto_published: 0 }, { trust_level: 1 }) === false, 'aprobado trust 1 → NO se avisa (el cambio del lote)');
  ok(E(db, { approval: 'auto', auto_published: 0 }, { trust_level: 1 }) === false, 'auto trust 1 → NO se avisa');
  ok(E(db, { approval: 'approved', auto_published: 0 }, { trust_level: 0 }) === false, 'aprobado manual → NO se avisa');
  ok(E(db, { approval: 'pending', auto_published: 0, owner_liked: 1 }, { trust_level: 1 }) === false, 'corazón tocado (owner_liked) trust 1 → NO se avisa, sin aprobar');
  ok(E(db, { approval: 'pending', auto_published: 0, owner_liked: 0 }, { trust_level: 1 }) === true, 'pendiente sin corazón trust 1 → SÍ se avisa (intacto)');
  ok(E(db, { approval: 'pending', auto_published: 0 }, { trust_level: 0 }) === true, 'manual pendiente trust 0 → SÍ se avisa (última llamada, intacto)');
  ok(E(db, { approval: 'pending', auto_published: 0 }, { trust_level: 2, autopilot_prenotify: 1 }) === true, 'trust 2 con prenotify → SÍ se avisa (intacto)');
  ok(E(db, { approval: 'pending', auto_published: 0 }, { trust_level: 2, autopilot_prenotify: 0 }) === false, 'trust 2 sin prenotify → NO se avisa (intacto)');
  ok(E(db, { approval: 'rejected', auto_published: 0 }, { trust_level: 1 }) === false, 'rechazado → NO se avisa (intacto)');

  console.log('— proceso: aprobado y con corazón no generan aviso; pendiente sí —');
  insP.run(301, 1, 'Posteo ya aprobado', '/m/301.jpg', sqlIn(30), 'approved', 0, 0, 0);
  insP.run(302, 1, 'Posteo con corazón', '/m/302.jpg', sqlIn(30), 'pending', 0, 0, 1);
  insP.run(303, 1, 'Posteo sin confirmar', '/m/303.jpg', sqlIn(30), 'pending', 0, 0, 0);
  insP.run(304, 2, 'Posteo manual pendiente', '/m/304.jpg', sqlIn(30), 'pending', 0, 0, 0);
  let r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: true, sent: 1 }) });
  ok(r.push === 2, 'solo 2 avisos: pendiente trust 1 + manual pendiente (aprobado y corazón, fuera)');
  ok(notified(301) === 0, 'aprobado queda SIN marca (no se avisó)');
  ok(notified(302) === 0, 'con corazón queda SIN marca (no se avisó)');
  ok(notified(303) === 1, 'pendiente sin confirmar queda marcado (se avisó)');
  ok(notified(304) === 1, 'manual pendiente queda marcado (se avisó, su última llamada)');
  ok(r.ineligible === 2, 'ineligibles = 2 (aprobado + corazón)');

  console.log('— ventana intacta —');
  insP.run(305, 1, 'Fuera de ventana', '/m/305.jpg', sqlIn(60), 'pending', 0, 0, 0);
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: true, sent: 1 }) });
  ok(notified(305) === 0, 'a 60 minutos NO se avisa (ventana (25,35] intacta)');

  console.log('— cliente: botón «i» y modal con textos exactos —');
  const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
  ok(appJs.includes('hf-info-btn') && appJs.includes('pzPubInfoOpen'), 'botón «i» presente en app.js');
  ok(appJs.includes('pzPubInfoHTML'), 'constructor del modal presente');
  // El botón vive en la fila del usuario de homeHeadHTML (no en stats).
  const hh = appJs.indexOf('function homeHeadHTML');
  const hhEnd = appJs.indexOf('function ', hh + 100);
  const hhSrc = appJs.slice(hh, hhEnd);
  ok(hhSrc.includes('hf-info-btn') && hhSrc.includes('hf-user'), 'botón «i» dentro de la cabecera homeHeadHTML (fila usuario)');
  ok(hhSrc.includes('hf-stats'), 'bloque de stats (seguidos) intacto en homeHeadHTML');
  // Textos exactos ES/EN dentro del constructor del modal.
  const esLines = [
    '¿Cómo publica Posty?',
    'Posty publica solo tus posteos programados (piloto automático).',
    'Si no confirmaste un posteo, te avisa 30 minutos antes, por si querés frenarlo.',
    'Si lo confirmaste antes, sale sin aviso.',
    'Si no lo confirmás, igual sale a su hora.',
    'En modo manual, nada sale sin tu OK.',
  ];
  const enLines = [
    'How does Posty publish?',
    'Posty publishes your scheduled posts on its own (autopilot).',
    "If you haven't confirmed a post, it warns you 30 minutes before, in case you want to stop it.",
    'If you confirmed it earlier, it goes out without notice.',
    "If you don't confirm it, it still goes out on time.",
    'In manual mode, nothing goes out without your OK.',
  ];
  for (const l of esLines) ok(appJs.includes(l), 'modal ES contiene: ' + l.slice(0, 40));
  for (const l of enLines) ok(appJs.includes(l), 'modal EN contiene: ' + l.slice(0, 40));
  ok(css.includes('.hf-info-btn'), 'CSS del botón «i» presente');
  // El corazón en piloto automático deja constancia owner_liked sin aprobar.
  const ht = appJs.indexOf('function hfTileApprove');
  const htEnd = appJs.indexOf('function ', ht + 100);
  const htSrc = appJs.slice(ht, htEnd);
  const apStart = htSrc.indexOf('if (!mode.manual)');
  const apEnd = htSrc.indexOf('return;\n    }', apStart) + 'return;\n    }'.length;
  const apBranch = htSrc.slice(apStart, apEnd);
  ok(apBranch.includes("action: 'like'"), 'hfTileApprove piloto automático deja constancia like (sin aprobar)');
  ok(!apBranch.includes('pcApprove'), 'rama piloto automático NO aprueba (sin pcApprove)');

  console.log(`\n${pass} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN:', e); process.exit(1); });
