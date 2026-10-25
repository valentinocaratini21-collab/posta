'use strict';
/* test-magia-postpago.js — MAGIA POST-PAGO (2026-10-25 · «ARMA TODO»).
 * Unidades con DB en memoria (sin IA, sin red, sin servidor):
 *  - hitos: markPaid idempotente (el primer pago gana, el reintento no
 *    reescribe la fecha) y siembra para cuentas ya activas.
 *  - celebración del primer posteo pago: solo con plan activo, una sola
 *    vez por cuenta, marca ANTES de avisar; canal push si hay
 *    suscripción, si no mensaje en el chat (app); nunca los dos.
 *  - idea 24 h: selectores de ventana + adopción de la pendiente.
 *  - mes 30: resumen desde el ledger (conteo en ventana, mejor posteo
 *    por el puntaje de la casa, nivel real); sin publicaciones no hay
 *    festejo; el resumen no se inventa fuera de ventana.
 *  - nombres canónicos de nivel (posty-level.js): los 5 de niveles-posty.md
 *    y de la landing, no los viejos.
 * Corre con: node test-magia-postpago.js
 */
const { DatabaseSync } = require('node:sqlite');
const magia = require('./magia-postpago');
const { postyLevel, LEVELS } = require('./posty-level');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }

function dbMemoria() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL DEFAULT '',
    plan TEXT DEFAULT 'trial', plan_status TEXT DEFAULT 'trial', lang TEXT DEFAULT 'es', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', category TEXT DEFAULT 'otro', tone TEXT DEFAULT '', description TEXT DEFAULT '', ig_username TEXT DEFAULT '');`);
  db.exec(`CREATE TABLE settings (user_id INTEGER PRIMARY KEY, brand_colors TEXT DEFAULT '', ig_user_id TEXT DEFAULT '', ig_access_token TEXT DEFAULT '');`);
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, image_path TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '', hashtags TEXT NOT NULL DEFAULT '', scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'draft',
    ig_permalink TEXT DEFAULT '', published_at TEXT, media_type TEXT DEFAULT 'image', source TEXT DEFAULT '',
    ig_likes INTEGER DEFAULT 0, ig_comments INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE posty_ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, week_key TEXT DEFAULT '',
    source TEXT DEFAULT '', angle_key TEXT DEFAULT '', title TEXT DEFAULT '', why TEXT DEFAULT '', format TEXT DEFAULT 'post',
    brief TEXT DEFAULT '', status TEXT DEFAULT 'pending', post_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), acted_at TEXT, eph_date TEXT DEFAULT '');`);
  db.exec(`CREATE TABLE push_subscriptions (user_id INTEGER NOT NULL, endpoint TEXT DEFAULT '', keys_json TEXT DEFAULT '', transport TEXT DEFAULT 'webpush');`);
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT DEFAULT '', text TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  db.exec(`CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, file_path TEXT NOT NULL, kind TEXT DEFAULT 'photo');`);
  db.exec(`CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT DEFAULT '');`);
  db.exec(`CREATE TABLE post_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, post_id INTEGER, client_signal TEXT DEFAULT '');`);
  db.exec(`CREATE TABLE style_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, rule_text TEXT DEFAULT '', active INTEGER DEFAULT 1);`);
  return db;
}
function mkUser(db, planStatus, lang) {
  const r = db.prepare(`INSERT INTO users (email, plan_status, lang) VALUES (?,?,?)`).run(`u${Date.now()}${Math.random()}@test.local`, planStatus, lang || 'es');
  const uid = Number(r.lastInsertRowid);
  db.prepare(`INSERT INTO profiles (user_id, business_name, category) VALUES (?, 'Negocio Test', 'cafeteria')`).run(uid);
  db.prepare(`INSERT INTO settings (user_id) VALUES (?)`).run(uid);
  return uid;
}
const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

(async () => {
  section('M1 · markPaid idempotente + siembra');
  {
    const db = dbMemoria();
    const uid = mkUser(db, 'active');
    const m1 = magia.markPaid(db, uid, 'activation');
    const m2 = magia.markPaid(db, uid, 'activation');
    ok(m1 && m1.paid_at_ms > 0, 'primer markPaid crea el hito con fecha');
    ok(m2 && m2.paid_at_ms === m1.paid_at_ms, 'segundo markPaid no reescribe la fecha');
    const uid2 = mkUser(db, 'active');
    const s = magia.ensureMilestoneForActive(db, uid2);
    ok(s && s.origin === 'seeded', 'cuenta activa sin hito se siembra con origin=seeded');
    const uid3 = mkUser(db, 'trial');
    ok(magia.ensureMilestoneForActive(db, uid3) === null, 'cuenta trial no se siembra');
  }

  section('M2 · celebración del primer posteo pago (canal único)');
  {
    const db = dbMemoria();
    const uidTrial = mkUser(db, 'trial');
    const rTrial = magia.celebrateFirstPaidPost(db, { user_id: uidTrial, id: 1, ig_permalink: 'https://ig.test/p/1' });
    ok(rTrial.celebrated === false && rTrial.reason === 'not_active', 'trial: no se celebra');
    const uid = mkUser(db, 'active');
    magia.markPaid(db, uid, 'activation');
    const r1 = magia.celebrateFirstPaidPost(db, { user_id: uid, id: 9, ig_permalink: 'https://ig.test/p/9' });
    ok(r1.celebrated === true && r1.channel === 'app', 'activo sin push: canal app');
    const chats = db.prepare(`SELECT text FROM chat_messages WHERE user_id = ?`).all(uid);
    ok(chats.length === 1 && chats[0].text.includes('https://ig.test/p/9'), 'mensaje en el chat con el link real del posteo');
    const r2 = magia.celebrateFirstPaidPost(db, { user_id: uid, id: 10, ig_permalink: 'https://ig.test/p/10' });
    ok(r2.celebrated === false && r2.reason === 'already', 'segundo posteo: no se vuelve a celebrar');
    ok(db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?`).get(uid).n === 1, 'un solo mensaje en total');
    const uidPush = mkUser(db, 'active');
    db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, 'https://push.test/x')`).run(uidPush);
    const r3 = magia.celebrateFirstPaidPost(db, { user_id: uidPush, id: 11, ig_permalink: 'https://ig.test/p/11' });
    ok(r3.celebrated === true && r3.channel === 'push', 'activo con push: canal push');
    ok(db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?`).get(uidPush).n === 0, 'con push no hay mensaje duplicado en el chat');
  }

  section('M3 · idea 24 h: ventana + adopción');
  {
    const db = dbMemoria();
    magia.ensureSchema(db);
    const uid = mkUser(db, 'active');
    const now = Date.now();
    db.prepare(`INSERT INTO postpay_milestones (user_id, paid_at_ms, origin) VALUES (?, ?, 'activation')`).run(uid, now - 3600 * 1000);
    const due = magia.dueIdea24(db, now);
    ok(due.length === 1 && due[0].user_id === uid, 'pago hace 1 h: dentro de la ventana');
    const uidOld = mkUser(db, 'active');
    db.prepare(`INSERT INTO postpay_milestones (user_id, paid_at_ms, origin) VALUES (?, ?, 'activation')`).run(uidOld, now - 25 * 3600 * 1000);
    ok(!magia.dueIdea24(db, now).some((r) => r.user_id === uidOld), 'pago hace 25 h: fuera de la ventana');
    db.prepare(`INSERT INTO posty_ideas (user_id, title, why, status) VALUES (?, 'Idea del loop', 'Porque rindió', 'pending')`).run(uid);
    const pend = magia.newestPendingIdea(db, uid);
    ok(pend && pend.title === 'Idea del loop', 'la pendiente del loop se adopta sin regenerar');
    magia.markIdea24(db, uid, pend.id, 1);
    ok(magia.getMilestone(db, uid).idea24_done === 1 && magia.getMilestone(db, uid).idea24_idea_id === pend.id, 'idea 24 h marcada con su id');
    ok(magia.ideaById(db, uid, pend.id) !== null, 'la idea adoptada se sirve por id');
  }

  section('M4 · mes 30 desde el ledger');
  {
    const db = dbMemoria();
    magia.ensureSchema(db);
    const uid = mkUser(db, 'active');
    const paidMs = Date.now() - 31 * 24 * 3600 * 1000;
    db.prepare(`INSERT INTO postpay_milestones (user_id, paid_at_ms, origin) VALUES (?, ?, 'activation')`).run(uid, paidMs);
    const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_likes, ig_comments) VALUES (?,?,?,?,?,?,?)`);
    ins.run(uid, '/media/a.jpg', 'El mejor posteo', 'published', fmt(paidMs + 5 * 24 * 3600 * 1000), 40, 6);
    ins.run(uid, '/media/b.jpg', 'Otro posteo', 'published', fmt(paidMs + 10 * 24 * 3600 * 1000), 3, 1);
    ins.run(uid, '/media/c.jpg', 'Fuera de ventana', 'published', fmt(paidMs + 40 * 24 * 3600 * 1000), 999, 999);
    const s = magia.month30Summary(db, uid, magia.getMilestone(db, uid));
    ok(s && s.published_count === 2, 'conteo solo dentro de la ventana [pago, +30d]');
    ok(s && s.best && s.best.caption_first === 'El mejor posteo', 'mejor posteo por likes + 3×comentarios, fuera de ventana excluido');
    ok(s && s.level && s.level.level_name === 'Nuevo en tu feed', 'nivel real del motor (sin datos: N1)');
    const uidSoon = mkUser(db, 'active');
    db.prepare(`INSERT INTO postpay_milestones (user_id, paid_at_ms, origin) VALUES (?, ?, 'activation')`).run(uidSoon, Date.now() - 5 * 24 * 3600 * 1000);
    ok(magia.month30Summary(db, uidSoon, magia.getMilestone(db, uidSoon)) === null, 'ventana sin cerrar: sin resumen');
    const sweep = magia.sweepMonth30(db, Date.now());
    ok(sweep.delivered === 1, 'sweep entrega UN mensaje de mes 30 con publicaciones');
    ok(db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?`).get(uid).n === 1, 'el mensaje quedó en el chat');
    ok(magia.getMilestone(db, uid).month30_done === 1, 'mes 30 marcado para no reintentar');
    const sweep2 = magia.sweepMonth30(db, Date.now());
    ok(sweep2.delivered === 0, 'segundo sweep: no duplica');
  }

  section('M5 · nombres canónicos de nivel');
  {
    ok(LEVELS[1].name === 'Nuevo en tu feed' && LEVELS[2].name === 'Leyendo tu mundo' && LEVELS[3].name === 'De la casa'
      && LEVELS[4].name === 'Mano derecha de tu Instagram' && LEVELS[5].name === 'Tu socio de contenido',
      'los 5 nombres son los canónicos de niveles-posty.md y la landing');
    const db = dbMemoria();
    const uid = mkUser(db, 'trial');
    const lv = postyLevel(db, uid);
    ok(lv.level_name === 'Nuevo en tu feed', 'postyLevel devuelve el nombre canónico N1');
  }

  section('M6 · cableado estático (servidor + frontend + magia)');
  {
    const fs = require('fs');
    const srv = fs.readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
    ok(srv.includes('runPostpayIdea24Sweep') && srv.includes('/api/postpay/status') && srv.includes('magiaMod.markPaid'),
      'server.js: sweep exportado, endpoint status y marcas en webhooks');
    const sch = fs.readFileSync(require('path').join(__dirname, 'scheduler.js'), 'utf8');
    ok(sch.includes('celebrateFirstPaidPost') && sch.includes('sweepMonth30'),
      'scheduler.js: celebración tras publicar + sweep mes 30');
    const app = fs.readFileSync(require('path').join(__dirname, 'public', 'app.js'), 'utf8');
    ok(app.includes('pzPostPayStatusMount') && app.includes('pzPostpayTray') && app.includes('Así estaba tu Instagram')
      && app.includes('Si tu primera semana no te convence, te la rehacemos entera, gratis.'),
      'app.js: bienvenida post-pago (antes/después + garantía exacta) y filas de Bandeja');
    const gj = fs.readFileSync(require('path').join(__dirname, 'public', 'gj.js'), 'utf8');
    ok(gj.includes('/api/posty/level') && gj.includes('gj-live') && gj.includes('__gjKt'),
      'gj.js: tallo vivo por endpoint + primitivas cinéticas expuestas');
  }

  console.log(fails ? `\n✗ ${fails} FALLA(S)` : '\n✓ TODAS LAS ASERCIONES EN VERDE');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('✗ ERROR DEL TEST:', e); process.exit(1); });
