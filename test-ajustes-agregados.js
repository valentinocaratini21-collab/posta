'use strict';
/* test-ajustes-agregados.js — 🔔⏸🚪 Los tres agregados de Ajustes (v283, 2026-10-21)
 *
 * 1) Bloque "🔔 Avisos": toggles persistidos (users.notify_letter /
 *    notify_failed) y RESPETADOS por push.js — la carta del domingo avisa
 *    una sola vez por carta nueva (el barrido solo llama al construirla) y
 *    el posteo fallido avisa con dedupe de 30 minutos (push.js).
 * 2) "⏸ Pausar todo": el freno de cuenta v275 desde un endpoint del dueño,
 *    con snapshot reversible (la reanudación deshace exactamente la pausa).
 * 3) 🚪 Días de cierre: profiles.closed_days respetado por los DOS motores
 *    de slots (scheduleDraftsPerWeek y assignScheduleSlots).
 *
 * Parte A: unidades con DB en memoria + funciones REALES extraídas de
 * server.js/scheduler.js (patrón de test-sunday-letter-window).
 * Parte B: E2E — bootea el servidor real con DATA_DIR temporal y ejerce
 * los endpoints por HTTP con sesión real.
 * Corre con: node test-ajustes-agregados.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const schedSrc = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
const chunkSrc = fs.readFileSync(path.join(__dirname, 'public', 'chunk-ajustes.js'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return null;
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 3);
}
function extractSpan(src, fromMarker, toFnName) {
  const a = src.indexOf(fromMarker);
  const b = src.indexOf('function ' + toFnName, a);
  const end = src.indexOf('\n}\n', b);
  return src.slice(a, end + 3);
}

function memDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, notify_letter INTEGER DEFAULT 1, notify_failed INTEGER DEFAULT 1, lang TEXT DEFAULT 'es');
           CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
           CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT, transport TEXT DEFAULT 'webpush');`);
  return db;
}

async function partA() {
  section('A1 · push.js — la carta del domingo respeta el toggle y el idioma');
  const push = require('./push.js');
  {
    const db = memDb();
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (1, 1, 1, ?)').run('es');
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (2, 1, 1, ?)').run('en');
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (3, 0, 1, ?)').run('es');
    const sent = [];
    const spy = async (uid, payload) => { sent.push([uid, payload]); return { ok: true, sent: 1 }; };
    const r1 = await push.notifySundayLetter(1, { db, sendFn: spy });
    ok(r1.ok && sent.length === 1 && /carta/i.test(sent[0][1].title), 'ES: sale el push de la carta');
    ok(sent[0][1].url === '/#/app/analisis', 'ES: el push lleva a Tu análisis');
    const r2 = await push.notifySundayLetter(2, { db, sendFn: spy });
    ok(r2.ok && sent.length === 2 && /Sunday letter/i.test(sent[1][1].title), 'EN: sale en inglés si la cuenta es EN');
    const r3 = await push.notifySundayLetter(3, { db, sendFn: spy });
    ok(!r3.ok && r3.reason === 'opted_out' && sent.length === 2, 'toggle OFF: no sale (opted_out)');
  }

  section('A2 · push.js — posteo fallido: primer aviso, dedupe 30 min, toggle');
  {
    const db = memDb();
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (1, 1, 1, ?)').run('es');
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (2, 1, 0, ?)').run('es');
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (3, 1, 1, ?)').run('es');
    const ev = (uid) => db.prepare('INSERT INTO events (user_id, name, props) VALUES (?, ?, ?)').run(uid, 'post_failed', '{}');
    const sent = [];
    const spy = async (uid, payload) => { sent.push([uid, payload]); return { ok: true, sent: 1 }; };
    ev(1);
    const r1 = await push.notifyPostFailed(1, { db, sendFn: spy });
    ok(r1.ok && sent.length === 1 && /Un posteo no pudo salir/.test(sent[0][1].title), 'primer fallo: avisa en singular');
    const marker = db.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id = 1 AND name = 'post_failed_push'").get();
    ok(marker.c === 1, 'el intento deja su marcador post_failed_push');
    ev(1);
    const r2 = await push.notifyPostFailed(1, { db, sendFn: spy });
    ok(!r2.ok && r2.reason === 'throttled' && sent.length === 1, 'segundo fallo dentro de 30 min: NO re-avisa (dedupe)');
    const r3 = await push.notifyPostFailed(2, { db, sendFn: spy });
    ok(!r3.ok && r3.reason === 'opted_out' && sent.length === 1, 'toggle OFF: no avisa');
    ev(3); ev(3);
    const r4 = await push.notifyPostFailed(3, { db, sendFn: spy });
    ok(r4.ok && sent.length === 2 && /Algunos posteos/.test(sent[1][1].title), 'ráfaga (2 en 10 min): la copia dice "algunos"');
  }

  section('A3 · scheduler.schedEvent — el evento post_failed dispara el aviso');
  {
    const db = memDb();
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (7, 1, 1, ?)').run('es');
    db.prepare('INSERT INTO users (id, notify_letter, notify_failed, lang) VALUES (8, 1, 0, ?)').run('es');
    push.initPush(db); // el hook usa la DB global de push (la del server en producción)
    const schedEvent = eval('(' + extractFn(schedSrc, 'schedEvent') + ')');
    schedEvent(db, 7, 'post_failed', { post_id: 9, kind: 'publish_error' });
    schedEvent(db, 8, 'post_failed', { post_id: 10, kind: 'publish_error' });
    schedEvent(db, 7, 'post_published', { post_id: 11 });
    await sleep(80);
    const m7 = db.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id = 7 AND name = 'post_failed_push'").get();
    const m8 = db.prepare("SELECT COUNT(*) AS c FROM events WHERE user_id = 8 AND name = 'post_failed_push'").get();
    ok(m7.c === 1, 'con el toggle ON, el fallo deja marcador de aviso (sin subs: intento registrado)');
    ok(m8.c === 0, 'con el toggle OFF, ni siquiera se intenta');
  }

  section('A4 · motores de slots — los días de cierre se respetan');
  {
    const tzSpan = extractSpan(serverSrc, 'function tzToday', 'zonedWallToUtc');
    const helpersSpan = extractSpan(serverSrc, 'function weekdayOfYmd', 'closedDaysOf');
    const quotaSpan = extractSpan(serverSrc, 'function quotaPoolKey', 'scheduleDraftsPerWeek');
    const assignSpan = extractFn(serverSrc, 'assignScheduleSlots');
    ok(!!(tzSpan && helpersSpan && quotaSpan && assignSpan), 'se extrajeron los motores reales de server.js');
    const engineDb = (closedJson) => ({ prepare(sql) { return {
      get: () => {
        if (sql.includes('best_hour')) return { best_hour: 19 };
        if (sql.includes('closed_days')) return { closed_days: closedJson };
        return null;
      },
      all: () => [],
    }; } });
    const make = (db) => new Function('db', 'getSettings', 'quotaFor', 'quotaCounts', 'recordSignal', 'require',
      'const DEFAULT_TZ = "America/Argentina/Buenos_Aires";\n' + tzSpan + '\n' + helpersSpan + '\n' + quotaSpan + '\n' + assignSpan +
      '\nreturn { weekdayOfYmd, closedDaysOf, scheduleDraftsPerWeek, assignScheduleSlots, mondayKeyOf, shiftDays, tzToday, ymdInTz };'
    )(db, () => ({ timezone: 'America/Argentina/Buenos_Aires' }), () => ({ limit: 99 }), () => ({ image: 0, carousel: 0, video: 0, story: 0 }), () => {}, require);
    const BA = 'America/Argentina/Buenos_Aires';

    // Control sin cierres: la semana entra completa (sin regresión).
    {
      const E = make(engineDb('[]'));
      const wk = E.mondayKeyOf(E.shiftDays(E.tzToday(BA), 7));
      const drafts = Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, media_type: 'image', week_key: wk }));
      const r = E.scheduleDraftsPerWeek(1, drafts, () => {});
      ok(r.scheduled.length === 7 && r.waiting.length === 0, 'control: sin cierres, 7/7 programados');
    }
    // (a) Cierra domingos: 7 posteos → 6 programados, ninguno en domingo.
    {
      const E = make(engineDb('[7]'));
      const wk = E.mondayKeyOf(E.shiftDays(E.tzToday(BA), 7));
      const drafts = Array.from({ length: 7 }, (_, i) => ({ id: 20 + i, media_type: 'image', week_key: wk }));
      const r = E.scheduleDraftsPerWeek(1, drafts, () => {});
      const onSunday = r.scheduled.filter((s) => E.weekdayOfYmd(E.ymdInTz(s.scheduled_at, BA)) === 7);
      ok(r.scheduled.length === 6 && r.waiting.length === 1, '(a) cierra domingos: la semana sale con 6, no con 7');
      ok(onSunday.length === 0, '(a) ningún posteo cae en domingo');
    }
    // (b) Cierra lun–vie: solo quedan sáb y dom → 2 de 4.
    {
      const E = make(engineDb('[1,2,3,4,5]'));
      const wk = E.mondayKeyOf(E.shiftDays(E.tzToday(BA), 7));
      const drafts = Array.from({ length: 4 }, (_, i) => ({ id: 30 + i, media_type: 'image', week_key: wk }));
      const r = E.scheduleDraftsPerWeek(1, drafts, () => {});
      const bad = r.scheduled.filter((s) => [1, 2, 3, 4, 5].includes(E.weekdayOfYmd(E.ymdInTz(s.scheduled_at, BA))));
      ok(r.scheduled.length === 2 && bad.length === 0, '(b) cierra 5 días: 2 programados, ninguno en día cerrado');
    }
    // (c) Cierra TODOS: no se programa nada y el motivo es closed_days.
    {
      const E = make(engineDb('[1,2,3,4,5,6,7]'));
      const wk = E.mondayKeyOf(E.shiftDays(E.tzToday(BA), 7));
      const drafts = Array.from({ length: 3 }, (_, i) => ({ id: 40 + i, media_type: 'image', week_key: wk }));
      const r = E.scheduleDraftsPerWeek(1, drafts, () => {});
      ok(r.scheduled.length === 0 && r.waiting.length === 3 && r.waiting.every((w) => w.reason === 'closed_days'), '(c) cierra todos: 0 programados, waiting=closed_days');
    }
    // assignScheduleSlots (el otro motor): cierra domingos / cierra todos.
    {
      const E = make(engineDb('[7]'));
      const drafts = Array.from({ length: 3 }, (_, i) => ({ id: 50 + i, media_type: 'image' }));
      const m = E.assignScheduleSlots(1, drafts);
      const onSunday = [...m.values()].filter((iso) => E.weekdayOfYmd(E.ymdInTz(iso, BA)) === 7);
      ok(m.size === 3 && onSunday.length === 0, 'assignScheduleSlots: 3 asignados, ninguno en domingo');
      const E2 = make(engineDb('[1,2,3,4,5,6,7]'));
      const m2 = E2.assignScheduleSlots(1, drafts);
      ok(m2.size === 0, 'assignScheduleSlots: con todos los días cerrados no asigna nada');
    }
  }

  section('A5 · estructura — endpoints, hooks y chunk');
  {
    ok(serverSrc.includes("const BUILD_ID = '20261020-v283'"), 'BUILD_ID v283');
    ok(serverSrc.includes("app.post('/api/autopilot/pause-all'"), 'existe POST /api/autopilot/pause-all');
    ok(serverSrc.includes("app.post('/api/autopilot/resume-all'"), 'existe POST /api/autopilot/resume-all');
    const pauseBlock = serverSrc.slice(serverSrc.indexOf("app.post('/api/autopilot/pause-all'"), serverSrc.indexOf("app.post('/api/autopilot/resume-all'"));
    ok(pauseBlock.includes('publishing_stopped = 1') && pauseBlock.includes('pause_snapshot') && pauseBlock.includes("status IN ('draft', 'paused', 'publishing')"), 'pause-all: misma mutación v275 + snapshot');
    const resumeBlock = serverSrc.slice(serverSrc.indexOf("app.post('/api/autopilot/resume-all'"), serverSrc.indexOf("app.get('/api/settings/notify-prefs'"));
    ok(resumeBlock.includes('publishing_stopped = 0') && resumeBlock.includes('scheduleAllDrafts'), 'resume-all: limpia la bandera y reprograma por el embudo');
    ok(serverSrc.includes("app.get('/api/settings/notify-prefs'") && serverSrc.includes("app.post('/api/settings/notify-prefs'"), 'existen GET/POST /api/settings/notify-prefs');
    const evHook = serverSrc.indexOf("if (name === 'post_failed' && userId)", serverSrc.indexOf('function evTrack'));
    ok(evHook > 0, 'evTrack (server) también dispara el aviso de fallo');
    const sweepBlock = serverSrc.slice(serverSrc.indexOf('async function refreshAnalysesSweep'), serverSrc.indexOf('async function refreshAnalysesSweep') + 4000);
    ok(sweepBlock.includes('notifySundayLetter') && sweepBlock.includes('sundayWindow && fresh'), 'el barrido avisa solo en ventana y con carta nueva');
    const iAvisos = chunkSrc.indexOf('🔔 Avisos');
    const iAuto = chunkSrc.indexOf('🚀 Posty en automático');
    const iPre = chunkSrc.indexOf('id="btnPreNotifyToggle"');
    ok(iAuto > 0 && iAvisos > iAuto && iPre > iAvisos, 'chunk: Avisos va tras Automático y el aviso pre-publicación vive SOLO ahí');
    const autoSeg = chunkSrc.slice(iAuto, iAvisos);
    ok(autoSeg.includes('id="btnPauseAll"') && !autoSeg.includes('Aviso antes de publicar'), 'chunk: Pausar todo arriba de Automático; el aviso ya no está en Automático');
    ok(chunkSrc.includes('id="closedDaysRow"') && chunkSrc.includes('closed_days:'), 'chunk: selector de días de cierre presente y en el guardado');
    ok(chunkSrc.includes('/api/settings/notify-prefs') && chunkSrc.includes('/api/autopilot/pause-all') && chunkSrc.includes('/api/autopilot/resume-all'), 'chunk: llama a los tres endpoints nuevos');
  }
}

async function partB() {
  section('B · E2E — servidor real, sesión real');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-v283-'));
  const PORT = 4177;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: dir, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  const base = `http://127.0.0.1:${PORT}`;
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); const j = await r.json(); if (j && j.build === '20261020-v283') up = true; } catch (e) {}
      if (!up) await sleep(750);
    }
    ok(up, 'el servidor bootea y sirve v283');
    if (!up) { console.error(bootLog.slice(-800)); return; }
    // Registro (crea la sesión).
    const email = `v283-${Date.now()}@example.com`;
    const reg = await fetch(base + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'secreto123' }),
    });
    const regJ = await reg.json();
    ok(reg.ok && regJ.ok, 'registro de usuario de prueba');
    const cookie = (reg.headers.getSetCookie ? reg.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    const api = async (method, p, body) => {
      const r = await fetch(base + p, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    // Semilla directa en la DB del server (posts en varios estados).
    const dbFile = path.join(dir, 'posta.db');
    const seed = new DatabaseSync(dbFile);
    seed.exec('PRAGMA busy_timeout = 8000');
    const u = seed.prepare('SELECT id, autopilot_enabled FROM users WHERE email = ?').get(email);
    const uid = u.id;
    ok(u.autopilot_enabled === 1, 'la cuenta nace con autopiloto activo (lo que el snapshot debe capturar)');
    const ins = seed.prepare(`INSERT INTO posts (user_id, image_path, caption, status, scheduled_at) VALUES (?, '/media/semilla.jpg', 'post de prueba', ?, ?)`);
    const fut = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    ins.run(uid, 'scheduled', fut); ins.run(uid, 'scheduled', fut); ins.run(uid, 'scheduled', fut);
    ins.run(uid, 'draft', null);
    const stopped = ins.run(uid, 'draft', null);
    seed.prepare('UPDATE posts SET user_stopped = 1 WHERE id = ?').run(stopped.lastInsertRowid);
    const stoppedId = Number(stopped.lastInsertRowid);
    seed.close();

    // Avisos: defaults y persistencia.
    let r = await api('GET', '/api/settings/notify-prefs');
    ok(r.j.ok && r.j.notify_letter === true && r.j.notify_failed === true && r.j.has_push_sub === false, 'notify-prefs: defaults ON/ON y sin suscripción push');
    r = await api('POST', '/api/settings/notify-prefs', { notify_failed: false });
    ok(r.j.ok && r.j.notify_failed === false, 'notify-prefs: apago el aviso de fallos');
    r = await api('GET', '/api/settings/notify-prefs');
    ok(r.j.notify_failed === false, 'notify-prefs: el apagado PERSISTE');
    r = await api('POST', '/api/settings/notify-prefs', { notify_failed: true });
    ok(r.j.ok && r.j.notify_failed === true, 'notify-prefs: lo vuelvo a prender');

    // Días de cierre: sanitización y persistencia vía PUT /api/profile.
    r = await api('PUT', '/api/profile', { business_name: 'Negocio Test', closed_days: [7, 1, 1, 'x', 9, 3] });
    ok(r.j.ok, 'profile: guardado con closed_days sucio no explota');
    r = await api('GET', '/api/profile');
    ok(r.j.closed_days === '[1,3,7]', `profile: closed_days quedó sanitizado y ordenado ([1,3,7], vino "${r.j.closed_days}")`);

    // Pausar todo: la mutación v275 + snapshot exacto.
    r = await api('POST', '/api/autopilot/pause-all', {});
    ok(r.j.ok && r.j.paused === true && r.j.paused_count === 4, 'pause-all: frena la cuenta (4 posteos marcados)');
    const chk = new DatabaseSync(dbFile);
    chk.exec('PRAGMA busy_timeout = 8000');
    const uu = chk.prepare('SELECT publishing_stopped, autopilot_enabled, pause_snapshot FROM users WHERE id = ?').get(uid);
    ok(uu.publishing_stopped === 1 && uu.autopilot_enabled === 0, 'pause-all: bandera de cuenta + autopiloto apagado');
    const snap = JSON.parse(uu.pause_snapshot || '{}');
    ok(Array.isArray(snap.post_ids) && snap.post_ids.length === 4 && !snap.post_ids.includes(stoppedId) && snap.autopilot_enabled === 1 && !!snap.at, 'pause-all: el snapshot captura fecha, autopiloto previo y SOLO los ids que marcó');
    const schedLeft = chk.prepare("SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND status = 'scheduled'").get(uid);
    const marked = chk.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND user_stopped = 1').get(uid);
    ok(schedLeft.c === 0 && marked.c === 5, 'pause-all: nada queda programado; marcados los 4 de la pausa + el frenado a mano');
    chk.close();
    r = await api('GET', '/api/autopilot');
    ok(r.j.paused === true && r.j.paused_count === 4 && !!r.j.paused_at, 'GET /api/autopilot: la pausa se lee (paused, fecha, cantidad)');

    // Reanudar: revierte EXACTO la pausa, no toca el freno manual.
    r = await api('POST', '/api/autopilot/resume-all', {});
    ok(r.j.ok && r.j.paused === false && r.j.unmarked === 4, 'resume-all: desmarca los 4 de la pausa');
    const chk2 = new DatabaseSync(dbFile);
    chk2.exec('PRAGMA busy_timeout = 8000');
    const u2 = chk2.prepare('SELECT publishing_stopped, autopilot_enabled, pause_snapshot FROM users WHERE id = ?').get(uid);
    ok(u2.publishing_stopped === 0 && u2.autopilot_enabled === 1 && !u2.pause_snapshot, 'resume-all: bandera limpia, snapshot vacío, autopiloto restaurado');
    const stillStopped = chk2.prepare('SELECT user_stopped FROM posts WHERE id = ?').get(stoppedId);
    ok(stillStopped.user_stopped === 1, 'resume-all: el posteo frenado A MANO sigue frenado');
    chk2.close();
    r = await api('GET', '/api/autopilot');
    ok(r.j.paused === false, 'GET /api/autopilot: la cuenta ya no está pausada');
  } catch (e) {
    ok(false, 'E2E explotó: ' + (e && e.message));
    console.error(bootLog.slice(-600));
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await partA();
  await partB();
  console.log(fails ? `\n❌ ${fails} fallas` : '\n✅ TODO VERDE');
  process.exit(fails ? 1 : 0);
})();
