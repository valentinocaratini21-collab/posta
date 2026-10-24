// test-upcoming-notice.js — tests de la cascada push → email del aviso
// "sale en 30 minutos" (upcoming-notice.js + notify-email.sendUpcomingEmail
// + scheduler.autopilotPreNotify). Reconstrucción de la suite original
// (38/38). Ninguna corrida toca Resend real: el transporte se captura
// stubbeando fetch global y solo se usan casillas @test.dev.
// Uso: node test-upcoming-notice.js
'use strict';
process.env.APPROVAL_SECRET = 'test-secret-upcoming';
delete process.env.APP_URL;
delete process.env.BASE_URL;

const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const sqlIn = (min) => new Date(Date.now() + min * 60000).toISOString().slice(0, 19).replace('T', ' ');

// Transporte de email capturado (stub de fetch hacia Resend).
const sentEmails = [];
let resendFails = false;
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.resend.com')) {
    if (resendFails) return { ok: false, status: 500, text: async () => 'boom' };
    sentEmails.push(JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => '{}' };
  }
  return realFetch(url, opts);
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'un-test-'));
const db = new DatabaseSync(path.join(dir, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'pro', plan_status TEXT DEFAULT 'active',
  lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE settings (user_id INTEGER, demo_mode INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires', image_base_url TEXT DEFAULT '');
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '',
  image_path TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'scheduled', approval TEXT DEFAULT 'pending',
  auto_published INTEGER DEFAULT 0, autopilot_notified INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0,
  media_type TEXT DEFAULT 'image', created_at TEXT DEFAULT (datetime('now')), published_at TEXT);
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`);

const UN = require('./upcoming-notice');
const NE = require('./notify-email');
const approval = require('./approval');

const insU = db.prepare(`INSERT INTO users (id, email, trust_level, autopilot_prenotify, client_name) VALUES (?, ?, ?, ?, ?)`);
const insS = db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
const insP = db.prepare(`INSERT INTO posts (id, user_id, caption, image_path, scheduled_at, approval, auto_published, autopilot_notified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const evOf = (pid, ch) => db.prepare(`SELECT COUNT(*) AS n FROM events WHERE name = 'post_upcoming_notice' AND props LIKE ? AND props LIKE ?`).get('%"post_id":' + pid + '%', '%"channel":"' + ch + '"%').n;
const notified = (pid) => db.prepare('SELECT autopilot_notified FROM posts WHERE id = ?').get(pid).autopilot_notified;

// Cuenta autopiloto (trust 1) en huso de Nueva York, y cuenta manual (trust 0).
insU.run(1, 'auto@test.dev', 1, 0, 'Negocio Auto');
insS.run(1, 'America/New_York');
insU.run(2, 'manual@test.dev', 0, 0, 'Negocio Manual');
insS.run(2, 'America/Argentina/Buenos_Aires');
insU.run(3, 'sinmail@test.dev', 1, 0, '');
db.prepare('UPDATE users SET email = ? WHERE id = 3').run('');

(async () => {
  console.log('— modo y elegibilidad (unidad) —');
  const M = UN._internal.modeFor, E = UN._internal.eligible;
  ok(M(db, { auto_published: 1, approval: 'pending' }, { trust_level: 1 }) === 'autopilot', 'modo: auto_published → autopilot');
  ok(M(db, { auto_published: 0, approval: 'pending' }, { trust_level: 0 }) === 'manual', 'modo: pending con trust 0 → manual');
  ok(M(db, { auto_published: 0, approval: 'pending' }, { trust_level: 1 }) === 'autopilot', 'modo: pending con trust ≥1 sale solo → autopilot');
  ok(E(db, { auto_published: 0, approval: 'pending' }, { trust_level: 2, autopilot_prenotify: 0 }) === false, 'elegibilidad: trust 2 sin aviso previo prendido → no se avisa (opt-in histórico)');
  ok(E(db, { auto_published: 0, approval: 'pending' }, { trust_level: 2, autopilot_prenotify: 1 }) === true, 'elegibilidad: trust 2 con aviso prendido → se avisa');
  ok(E(db, { auto_published: 0, approval: 'pending' }, { trust_level: 0 }) === true, 'elegibilidad: manual pending siempre se avisa (es su última llamada)');

  console.log('— sin push → email encolado (autopilot) —');
  process.env.RESEND_API_KEY = 'test-resend-key';
  insP.run(101, 1, 'Promo de hoy en el local\nsegunda línea que no va', '/media/foto101.jpg', sqlIn(30), 'pending', 1, 0);
  let r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  ok(r.email === 1 && r.push === 0, 'sin suscripciones push → sale el email de respaldo');
  ok(sentEmails.length === 1 && sentEmails[0].to[0] === 'auto@test.dev', 'el email va a la casilla de la cuenta');
  ok(sentEmails[0].subject === '⏰ Tu posteo sale en 30 minutos', 'autopilot: asunto informativo espejo del push');
  ok(sentEmails[0].html.includes('Promo de hoy en el local') && !sentEmails[0].html.includes('segunda línea'), 'el email lleva SOLO la primera línea del caption');
  ok(sentEmails[0].html.includes('/media/foto101.jpg'), 'el email lleva la miniatura del posteo');
  const expectedWhen = (() => {
    const d = new Date(sqlIn(30).replace(' ', 'T') + 'Z');
    const parts = new Intl.DateTimeFormat('es-AR', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }).formatToParts(d);
    const g = (t) => ((parts.find((p) => p.type === t) || {}).value || '').replace(/\.$/, '');
    return `${g('weekday')} ${g('hour')}:${g('minute')}`;
  })();
  ok(sentEmails[0].html.includes(expectedWhen), 'el email lleva día/hora en el timezone de la cuenta (Nueva York)');
  ok(notified(101) === 1, 'quedó marcado: un solo aviso por posteo');
  ok(evOf(101, 'email') === 1, 'evento post_upcoming_notice con channel=email');

  console.log('— push ok → sin email —');
  insP.run(102, 1, 'Otro posteo autopiloto', '/media/foto102.jpg', sqlIn(30), 'pending', 1, 0);
  const before102 = sentEmails.length;
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: true, sent: 1 }) });
  ok(r.push === 1 && sentEmails.length === before102, 'push entregado → NO sale email (respaldo, nunca duplicado)');
  ok(notified(102) === 1 && evOf(102, 'push') === 1, 'marcado con channel=push');

  console.log('— push falla por otras vías → email —');
  insP.run(103, 1, 'Posteo con VAPID caído', '/media/foto103.jpg', sqlIn(30), 'pending', 1, 0);
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_vapid' }) });
  ok(r.email === 1 && notified(103) === 1, 'no_vapid → email de respaldo');
  insP.run(104, 1, 'Posteo con push que explota', '/media/foto104.jpg', sqlIn(30), 'pending', 1, 0);
  r = await UN.processUpcomingNotices(db, { pushFn: async () => { throw new Error('red caída'); } });
  ok(r.email === 1 && notified(104) === 1, 'push que tira excepción → email de respaldo (nunca se rompe el tick)');

  console.log('— modo manual: asunto y link firmado de un toque —');
  insP.run(201, 2, 'Posteo manual esperando ok', '/media/foto201.jpg', sqlIn(30), 'pending', 0, 0);
  const before201 = sentEmails.length;
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  const mail201 = sentEmails[sentEmails.length - 1];
  ok(sentEmails.length === before201 + 1 && r.email === 1, 'manual sin push → email');
  ok(mail201.subject === '⏰ Sale en 30 minutos: ¿lo publicamos?', 'manual: asunto exacto de aprobación');
  const mm = mail201.html.match(/\/api\/posts\/201\/approve\?sig=([a-f0-9]+)&exp=(\d+)/);
  ok(!!mm, 'manual: el email lleva el link firmado de aprobación');
  ok(!!mm && approval.verifyAction(201, 'approve', mm[1], mm[2]) === true, 'manual: el link verifica sin login (firma HMAC válida)');
  ok(!!mm && approval.verifyAction(201, 'reject', mm[1], mm[2]) === false, 'manual: la firma está atada a la acción (no sirve para otra)');

  console.log('— fail-closed honesto: sin RESEND o sin email → chat —');
  delete process.env.RESEND_API_KEY;
  insP.run(105, 1, 'Posteo sin canal externo', '/media/foto105.jpg', sqlIn(30), 'pending', 1, 0);
  const before105 = sentEmails.length;
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  ok(r.chat === 1 && sentEmails.length === before105, 'sin RESEND_API_KEY: no se envía ni se finge ningún email');
  ok(db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1 AND text LIKE '%30 minutos%'").get().n === 1, 'el aviso queda registrado en el chat de la cuenta');
  ok(evOf(105, 'chat') === 1, 'evento honesto channel=chat');
  const evChat = db.prepare(`SELECT props FROM events WHERE name = 'post_upcoming_notice' AND props LIKE '%"post_id":105%'`).get();
  ok(!!evChat && JSON.parse(evChat.props).email_reason === 'no_config', 'el evento declara el motivo (no_config)');

  process.env.RESEND_API_KEY = 'test-resend-key';
  insP.run(301, 3, 'Posteo de cuenta sin email', '/media/foto301.jpg', sqlIn(30), 'pending', 1, 0);
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  ok(r.chat === 1 && evOf(301, 'chat') === 1, 'cuenta sin email cargado → chat, con evento honesto');

  console.log('— fallo transitorio: reintento dentro de la ventana, sin doble aviso —');
  insP.run(106, 1, 'Posteo con Resend caído', '/media/foto106.jpg', sqlIn(30), 'pending', 1, 0);
  resendFails = true;
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  ok(r.retried === 1 && notified(106) === 0, 'Resend 500 → NO se marca: queda para reintentar');
  ok(evOf(106, 'retry') === 1 && evOf(106, 'chat') === 0, 'el fallo transitorio NO se disfraza de aviso por chat');
  resendFails = false;
  const before106 = sentEmails.length;
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  ok(r.email === 1 && sentEmails.length === before106 + 1 && notified(106) === 1, 'al volver Resend, el reintento manda el email (una sola vez)');
  r = await UN.processUpcomingNotices(db, { pushFn: async () => ({ ok: true, sent: 1 }) });
  ok(r.checked === 0 && sentEmails.length === before106 + 1, 'ya marcado: ningún proceso posterior re-avisa el mismo posteo');

  console.log('— dedup estructural y ventana —');
  insP.run(107, 1, 'Ya avisado de antes', '/media/foto107.jpg', sqlIn(30), 'pending', 1, 1);
  insP.run(108, 1, 'Todavía falta una hora', '/media/foto108.jpg', sqlIn(60), 'pending', 1, 0);
  insP.run(109, 1, 'Sale en diez minutos', '/media/foto109.jpg', sqlIn(10), 'pending', 1, 0);
  let pushCalls = 0;
  r = await UN.processUpcomingNotices(db, { pushFn: async () => { pushCalls++; return { ok: true, sent: 1 }; } });
  ok(pushCalls === 0 && r.checked === 0, 'fuera de ventana o ya notificado: ni push ni email');

  console.log('— fix raíz de notify-email (client_name) —');
  const beforeFix = sentEmails.length;
  const rr = await NE.sendUpcomingEmail(db, { id: 999, user_id: 2, caption: 'Directo al módulo', image_path: '/media/x.jpg', scheduled_at: sqlIn(30) }, { mode: 'autopilot' });
  ok(rr.ok === true && sentEmails.length === beforeFix + 1, 'sendUpcomingEmail resuelve el usuario (client_name) y envía');
  const ra = await NE.sendApprovalEmail(db, { id: 555, user_id: 2, caption: 'Aprobame este', image_path: '/media/y.jpg', scheduled_at: sqlIn(180) });
  ok(ra.ok === true, 'el fix revive también sendApprovalEmail (estaba muerto en producción)');
  const rm = await NE.sendMissedEmail(db, { id: 556, user_id: 2, caption: 'Perdido', image_path: '/media/z.jpg', scheduled_at: sqlIn(180) });
  ok(rm.ok === true, 'el fix revive también sendMissedEmail');

  console.log('— integración: scheduler.autopilotPreNotify con push real —');
  const push = require('./push');
  push.initPush(db);
  db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport) VALUES (1, 'fcm-token-falso', '{}', 'fcm')").run();
  insP.run(110, 1, 'Posteo vía scheduler', '/media/foto110.jpg', sqlIn(30), 'pending', 1, 0);
  const sched = require('./scheduler');
  const before110 = sentEmails.length;
  await sched.autopilotPreNotify(db);
  ok(sentEmails.length === before110 + 1 && notified(110) === 1, 'scheduler: push real no configurado (FCM) → la cascada manda el email');
  ok(evOf(110, 'email') === 1, 'scheduler: el evento registra el canal real');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN:', e); process.exit(1); });
