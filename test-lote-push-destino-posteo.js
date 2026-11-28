'use strict';
/*
 * LOTE PUSH-DESTINO-POSTEO (27/11) — las push que son información de
 * posteos aterrizan EN el posteo (regla del dueño 27/11 23:44: «las
 * push que son informacion de los posteos, te llevan a los posteos»).
 * Nombre de archivo: el lote PUSH-DESTINO del 22/11 ya ocupa
 * test-lote-push-destino.js (ruteo del tap en el cliente); esta suite
 * es de los EMISORES y vive en su propio archivo.
 *
 * Qué afirma, por clase:
 *  A · estática: cada sitio corregido construye su payload con la url
 *      del posteo (mañana, falla + sus dos llamadores, resolver-idea
 *      con posteo, las 4 conversiones de Subir, prueba días 2/3, video
 *      listo → chat?msg) y los destinos no tocados quedan como estaban
 *      (resolver-idea sin posteo → Subir).
 *  B · módulo mañana (node:sqlite, pushFn capturador): la push de las
 *      9:00 sale con url del posteo de hoy y su postId en data.
 *  C · módulo prueba (mismo andamiaje que la C4 de la suite del 22/11):
 *      el recibo de los días 2/3 sale con url del posteo de hoy.
 *  D · módulo falla (push.js real, sendFn capturado): con post_id la
 *      url es el posteo — también en plural, es el posteo que disparó
 *      ESTE aviso —; sin post_id (o inválido) cae al Inicio, como hoy.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (nombre, cond, detalle) => {
  if (cond) { pass++; console.log('  ✓ ok · ' + nombre); }
  else { fail++; console.log('  ✗ MAL · ' + nombre + (detalle ? ' :: ' + detalle : '')); }
};
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

(async () => {
  console.log('— A) estáticos —');
  const mp = R('morning-post-push.js');
  const td = R('trial-day-push.js');
  const pj = R('push.js');
  const sc = R('scheduler.js');
  const sv = R('server.js');

  t('A1 mañana: payload con la url del posteo de hoy', mp.includes("url: '/#/app/post/' + post.id"));
  t('A2 mañana: la url del ritual no se emite más', !mp.includes("url: '/#/app/ritual'"));
  t('A3 mañana: el postId sigue viajando en data', mp.includes("data: { postId: String(post.id) }"));
  t('A4 prueba: payload con la url del posteo de hoy', td.includes("url: '/#/app/post/' + p.id"));
  t('A5 falla: la url se deriva del postId con caída al Inicio',
    pj.includes("falloPostId ? '/#/app/post/' + falloPostId : '/#/app/inicio'") && count(pj, 'url: falloUrl') === 2);
  t('A6 falla: ningún payload de push.js hardcodea más el Inicio', !pj.includes("url: '/#/app/inicio'"));
  t('A7 scheduler pasa el post_id del evento a notifyPostFailed',
    sc.includes("notifyPostFailed(userId, { postId: props && props.post_id })"));
  t('A8 server (evTrack) pasa el post_id del evento a notifyPostFailed',
    sv.includes("notifyPostFailed(userId, { postId: props && props.post_id })"));
  t('A9 resolver-idea CON posteo → el posteo', sv.includes("url: '/#/app/post/' + Number(post.id)"));
  t('A10 resolver-idea SIN posteo → Subir, intacto',
    sv.includes("url: '/#/app/subir', data: { idea_id: Number(idea.id) } }"));
  t('A11 Subir foto/borrador → el borrador creado (lastInsertRowid)',
    count(sv, "url: '/#/app/post/' + ins.lastInsertRowid") === 2);
  t('A12 Subir video/reel → el reel creado (out.postId)',
    count(sv, "url: '/#/app/post/' + out.postId") === 2);
  t('A13 las 4 conversiones ya no emiten la semana',
    !sv.includes("Miralo en tu semana 👇', url: '/#/app/semana'") && !sv.includes("listo para publicar 👇', url: '/#/app/semana'"));
  t('A14 video listo: captura el id del mensaje y aterriza en él',
    sv.includes("insMsg.lastInsertRowid") && sv.includes("'/#/app/chat?msg=' + videoMsgId") && sv.includes('url: videoChatUrl'));
  for (const f of ['morning-post-push.js', 'trial-day-push.js', 'push.js', 'scheduler.js', 'server.js']) {
    try { execSync(`node --check ${f}`, { cwd: __dirname, stdio: 'pipe' }); t('A15 node --check ' + f, true); }
    catch (e) { t('A15 node --check ' + f, false, String(e.message).slice(0, 120)); }
  }

  console.log('— B) módulo · push de la mañana —');
  try {
    const M = require('./morning-post-push');
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, lang TEXT DEFAULT 'es', publishing_stopped INTEGER DEFAULT 0);
      CREATE TABLE settings (user_id INTEGER, timezone TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, scheduled_at TEXT, status TEXT, image_path TEXT, media_type TEXT);
      CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`);
    try { M.ensureMorningTable(db); } catch (e) {}
    db.prepare("INSERT INTO users (id, email, lang, publishing_stopped) VALUES (1, 'u1@test.dev', 'es', 0)").run();
    db.prepare("INSERT INTO settings (user_id, timezone) VALUES (1, 'America/Argentina/Buenos_Aires')").run();
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint) VALUES (1, 'https://push.test/1')").run();
    db.prepare("INSERT INTO posts (id, user_id, scheduled_at, status, image_path, media_type) VALUES (42, 1, '2026-11-02T22:00:00Z', 'scheduled', '/media/f.jpg', 'image')").run();
    const caps = [];
    const r = await M.sendMorningPostPush(db, { now: new Date('2026-11-02T12:00:00Z'), pushFn: async (uid, payload) => { caps.push(payload); return { ok: true, sent: 1 }; } });
    t('B1 la push de la mañana salió', r.sent === 1 && caps.length === 1, JSON.stringify({ r, caps: caps.map((c) => c.url) }));
    t('B2 aterriza en el posteo de hoy', caps[0] && caps[0].url === '/#/app/post/42', caps[0] && caps[0].url);
    t('B3 el postId viaja en data', caps[0] && caps[0].data && caps[0].data.postId === '42');
    t('B4 el texto no cambió', caps[0] && caps[0].body === 'Hoy sale este — sale a las 19:00', caps[0] && caps[0].body);
  } catch (e) { t('B excepción', false, String(e && e.message).slice(0, 200)); }

  console.log('— C) módulo · prueba días 2/3 —');
  try {
    const TD = require('./trial-day-push');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-posteo-c-'));
    const db = new DatabaseSync(path.join(dir, 't.db'));
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'pro', plan_status TEXT DEFAULT 'active',
      lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0,
      is_guest INTEGER DEFAULT 0, trial_ends_at INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE settings (user_id INTEGER, demo_mode INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/New_York', image_base_url TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '',
      image_path TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'scheduled', approval TEXT DEFAULT 'pending',
      auto_published INTEGER DEFAULT 0, autopilot_notified INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0,
      media_type TEXT DEFAULT 'image', created_at TEXT DEFAULT (datetime('now')), published_at TEXT, ig_permalink TEXT DEFAULT '');
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');
    CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, created_at INTEGER, payload TEXT DEFAULT '{}');`);
    const now = Date.parse('2026-11-24T15:00:00Z'); // 10:00 EST
    db.prepare("INSERT INTO users (id, email, is_guest, trial_ends_at, guest_ig, lang) VALUES (9, 'guest@test.dev', 1, ?, 'negocioqa', 'es')").run(now + 86400000);
    db.prepare("INSERT INTO settings (user_id, timezone) VALUES (9, 'America/New_York')").run();
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint) VALUES (9, 'https://push.test/9')").run();
    db.prepare("INSERT INTO trial_cache (ig, created_at, payload) VALUES ('negocioqa', ?, '{}')").run(Date.parse('2026-11-23T15:00:00Z'));
    db.prepare("INSERT INTO posts (id, user_id, scheduled_at, status) VALUES (301, 9, '2026-11-24T19:00:00.000Z', 'scheduled')").run();
    const caps = [];
    const r = await TD.sendTrialDayPushes(db, { now, pushFn: async (uid, payload) => { caps.push(payload); return { ok: true, sent: 1 }; } });
    t('C1 la push de la prueba salió', r.sent === 1 && caps.length === 1, JSON.stringify({ r, caps: caps.map((c) => c.url) }));
    t('C2 aterriza en el posteo de hoy de la prueba', caps[0] && caps[0].url === '/#/app/post/301', caps[0] && caps[0].url);
  } catch (e) { t('C excepción', false, String(e && e.message).slice(0, 200)); }

  console.log('— D) módulo · push de falla —');
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-posteo-d-'));
    const db = new DatabaseSync(path.join(dir, 't.db'));
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, lang TEXT, notify_failed INTEGER, notify_letter INTEGER);
             CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT, name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));`);
    db.prepare("INSERT INTO users (id, lang) VALUES (1, 'es'), (2, 'en'), (3, 'es'), (4, 'es'), (5, 'es')").run();
    const push = require('./push.js');
    const caps = [];
    const sendFn = async (uid, payload) => { caps.push([uid, payload]); return { ok: true, sent: 1 }; };
    // D1: con post_id → el posteo (ES singular)
    db.prepare("INSERT INTO events (user_id, name) VALUES (1, 'post_failed')").run();
    await push.notifyPostFailed(1, { db, sendFn, postId: 777 });
    t('D1 con post_id aterriza en ese posteo', caps[0] && caps[0][1].url === '/#/app/post/777', caps[0] && caps[0][1].url);
    t('D2 el texto no cambió', caps[0] && caps[0][1].title === 'Tu posteo de hoy no salió' && caps[0][1].body === 'Ya lo estamos resolviendo. Te aviso apenas esté publicado.');
    // D3: sin post_id → Inicio (defensivo, como hoy)
    caps.length = 0;
    await push.notifyPostFailed(3, { db, sendFn });
    t('D3 sin post_id cae al Inicio', caps[0] && caps[0][1].url === '/#/app/inicio', caps[0] && caps[0][1].url);
    // D4: plural (2 fallos en 10 min) con post_id → el posteo que disparó ESTE aviso
    db.prepare("INSERT INTO events (user_id, name) VALUES (2, 'post_failed'), (2, 'post_failed')").run();
    caps.length = 0;
    await push.notifyPostFailed(2, { db, sendFn, postId: 888 });
    t('D4 plural: título en plural', caps[0] && caps[0][1].title === "Today's posts didn't go out", caps[0] && caps[0][1].title);
    t('D5 plural: aterriza en el posteo disparador', caps[0] && caps[0][1].url === '/#/app/post/888', caps[0] && caps[0][1].url);
    // D6: post_id inválido (0) → Inicio
    caps.length = 0;
    await push.notifyPostFailed(4, { db, sendFn, postId: 0 });
    t('D6 post_id 0 cae al Inicio', caps[0] && caps[0][1].url === '/#/app/inicio', caps[0] && caps[0][1].url);
    // D7: post_id como string numérico → el posteo
    caps.length = 0;
    await push.notifyPostFailed(5, { db, sendFn, postId: '555' });
    t('D7 post_id string numérico aterriza en el posteo', caps[0] && caps[0][1].url === '/#/app/post/555', caps[0] && caps[0][1].url);
  } catch (e) { t('D excepción', false, String(e && e.message).slice(0, 200)); }

  console.log(`\nRESULTADO: ${pass} ok · ${fail} MAL`);
  process.exit(fail ? 1 : 0);
})();
