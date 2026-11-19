'use strict';

// =====================================================================
// LOTE DESCARTE-TERMINAL — el posteo eliminado por el dueño no reaparece
// =====================================================================
// Caso real (Valentino, 19/11 09:31, con captura): eliminó el posteo
// de hoy de su cuenta (user 12) y el posteo volvió — el 725, creado
// 06:54:59 UTC por el ensure del día (makeIdeaDraft + programarHoy a
// las 19:00 de la cuenta) DESPUÉS de su descarte. Diagnóstico: las
// dos puertas del dueño para descartar una pieza — PATCH
// action='cancel' («Saltar»/«Rechazar») y DELETE /api/posts/:id
// («Eliminar») — no escribían NADA a nivel día: el descarte era «de
// la pieza, no del día» (criterio de DESCARTE-ADMIN para la vía
// admin). ensureTodayPost solo respeta day_stops (la pausa
// 'unschedule', PAUSA-DURABLE), así que el día descartado se leía
// «libre» y el relleno lo reponía. Misma clase en la ruta de extras:
// generateWeekExtras cuenta el cupo solo con draft/scheduled/
// published — un reel cancelado reabría el cupo y la ruta paría la
// copia siguiente (703→714, u105, 18/11), heredando el caption
// byte-idéntico del posteo de feed.
//
// El lote (mínimo, sobre la infraestructura vigente):
//   1. PATCH action='cancel' sobre un posteo con fecha (no historia)
//      escribe day_stops con origen 'dueno_descarte' — espejo del
//      'unschedule', que ya marcaba el día. Los lectores ya existían
//      (ensureTodayPost, programarHoy, scheduleDraftsPerWeek): el
//      día queda vacío salvo gesto deliberado del dueño sobre ese
//      día («Armar otro»/programar/aceptar limpian el stop).
//   2. DELETE /api/posts/:id con día (no publicado, no historia)
//      escribe el mismo stop ANTES de borrar la fila.
//   3. generateWeekExtras cuenta como cupo cubierto los extras de
//      la semana descartados POR EL DUEÑO (cancelled + su stop
//      'dueno_descarte'): no se regeneran. El descarte del EQUIPO
//      por la vía admin no escribe la marca (su criterio vigente:
//      descartar una pieza defectuosa deja el cupo abierto) y no
//      cuenta — la distinción es el ORIGEN, no el estado (B2 lo
//      prueba en ejecutable).
//
// La suite corre en tres partes:
//   A · Estática: los escritores existen en server.js, el conteo
//       nuevo vive en story-reel.js y la vía admin NO ganó la marca.
//   B · Conducta de generateWeekExtras contra DBs en memoria
//       (receta de test-ai-video.js): B1 el dueño descartó el reel
//       (703) → no nace el 714; B2 el descarte sin marca del dueño
//       (vía admin) → el cupo se repone como siempre; B3 control
//       sin descarte → la semana genera su reel.
//   C · Boot real del árbol + HTTP: siembra (modo DESCARTE_SEED=1
//       de este mismo archivo) con tres cuentas — la del dueño con
//       el posteo de hoy programado + un borrador de hoy (el vector
//       de resurrección: el ensure lo promovería), la del DELETE y
//       la de control. Cancelar/Eliminar escriben el stop, el
//       ensure responde 'dia_frenado_dueno' y NO crea ni promueve
//       nada; «Que Posty lo arme» (armar:1) limpia el stop y el día
//       se rearma — el gesto del dueño manda sobre su propio freno.
// Control: contra la base prístina la suite falla en A1–A3, B1 y
// C2/C3/C5 (el mecanismo no existe y el 714/725 renacen).
// Uso: node test-lote-descarte-terminal.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const TZ = 'America/New_York';

// ---------------------------------------------------------------------
// Modo siembra (parte C): crea la DB del boot con las tres cuentas.
// ---------------------------------------------------------------------
if (process.env.DESCARTE_SEED === '1') {
  const bcrypt = require('bcryptjs');
  const db = require('./db');
  require('./guest-trial').ensureSchema(db);
  const { dayKeyInTz } = require('./morning-post-push');
  const conserjeRevision = require('./conserje-revision');
  const hoy = dayKeyInTz(new Date(), TZ);
  const aLas = (key, hora) => new Date(conserjeRevision.wallToUtc(key + ' ' + hora, TZ)).toISOString();
  const hash = bcrypt.hashSync('suite-pass', 10);
  const ins = (sql, ...p) => db.prepare(sql).run(...p);
  for (const [id, email] of [[12, 'dueno@posty.app'], [13, 'control@posty.app'], [14, 'borra@posty.app']]) {
    ins(`INSERT INTO users (id, email, password_hash, plan, plan_status) VALUES (?, ?, ?, 'posty', 'active')`, id, email, hash);
    ins(`INSERT INTO profiles (user_id, business_name, ig_username, category, description) VALUES (?, 'Posty', 'posty.communitymanager', 'Marketing', 'Posty es tu community manager: posteamos por tu negocio todos los días.')`, id);
    ins(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`, id, TZ);
    ins(`INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)`, id, JSON.stringify({ producto_estrella: 'Posty, tu community manager' }));
  }
  const post = (id, uid, status, img, caption, sched) =>
    ins(`INSERT INTO posts (id, user_id, status, media_type, image_path, caption, scheduled_at) VALUES (?, ?, ?, 'image', ?, ?, ?)`, id, uid, status, img, caption, sched);
  // Cuenta 12 (fixture 725): el posteo de hoy programado + el borrador
  // de hoy que el ensure promovería si el día quedara «libre».
  post(7250, 12, 'scheduled', '/media/hoy-a.jpg', 'EL POSTEO DE HOY — fixture 725', aLas(hoy, '19:00'));
  post(7251, 12, 'draft', '/media/hoy-b.jpg', 'borrador de hoy (vector de resurrección)', null);
  // Cuenta 13 (control): solo el borrador — el ensure lo programa.
  post(7253, 13, 'draft', '/media/hoy-d.jpg', 'borrador de hoy (control)', null);
  // Cuenta 14 (DELETE): programado de hoy + borrador de hoy.
  post(7254, 14, 'scheduled', '/media/hoy-e.jpg', 'EL POSTEO DE HOY — se elimina', aLas(hoy, '19:00'));
  post(7255, 14, 'draft', '/media/hoy-f.jpg', 'borrador de hoy (no debe promoverse)', null);
  console.log('[seed] hoy=' + hoy + ' cuentas 12/13/14 sembradas');
  process.exit(0);
}

(async () => {
  // -------------------------------------------------------------------
  seccion('A · estática del lote');
  const SRV = read('server.js');
  const iCancel = SRV.indexOf("if (action === 'cancel')");
  const iUnsched = SRV.indexOf("action === 'unschedule'", iCancel);
  const cancelSlice = iCancel > 0 ? SRV.slice(iCancel, iUnsched > iCancel ? iUnsched : iCancel + 3000) : '';
  t('A1 el cancel del dueño escribe el stop del día (dueno_descarte)',
    cancelSlice.includes("dayStopSet(req.session.userId") && cancelSlice.includes("'dueno_descarte'"));
  const iDel = SRV.indexOf("app.delete('/api/posts/:id'");
  const delSlice = iDel > 0 ? SRV.slice(iDel, iDel + 3500) : '';
  const iStopEnDel = delSlice.indexOf("'dueno_descarte'");
  const iDeleteSql = delSlice.indexOf('DELETE FROM posts');
  t('A2 el DELETE del dueño escribe el stop ANTES de borrar la fila',
    iStopEnDel > 0 && iDeleteSql > iStopEnDel);
  const SR = read('story-reel.js');
  t('A3 generateWeekExtras cuenta el descarte del dueño como cupo cubierto',
    SR.includes('day_stops') && SR.includes("'dueno_descarte'") && SR.includes('JOIN posts'));
  const iAdminDesc = SRV.indexOf("/api/admin/posts/:id/descartar");
  const adminSlice = iAdminDesc > 0 ? SRV.slice(iAdminDesc, iAdminDesc + 6000) : '';
  t('A4 la vía admin NO ganó la marca (actores distintos, como siempre)',
    iAdminDesc > 0 && !adminSlice.includes('dueno_descarte'));
  const iEnsure = SRV.indexOf('async function ensureTodayPost');
  const ensureSlice = iEnsure > 0 ? SRV.slice(iEnsure, iEnsure + 16000) : '';
  t('A5 el ensure sigue frenando por dayStopGet antes de generar',
    ensureSlice.indexOf('dia_frenado_dueno') > 0 && ensureSlice.indexOf('dia_frenado_dueno') < ensureSlice.indexOf('makeIdeaDraft'));

  // -------------------------------------------------------------------
  seccion('B · generateWeekExtras: el reel descartado no renace');
  const { DatabaseSync } = require('node:sqlite');
  const storyReel = require('./story-reel');
  const WK = '2026-11-16';
  function buildExtrasDb() {
    const d = new DatabaseSync(':memory:');
    d.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, plan TEXT, plan_status TEXT, is_guest INTEGER DEFAULT 0);
      CREATE TABLE profiles (user_id INTEGER, business_name TEXT, category TEXT, ig_username TEXT, description TEXT);
      CREATE TABLE settings (user_id INTEGER, brand_colors TEXT);
      CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, file_path TEXT, created_at TEXT DEFAULT (datetime('now')), album_tag TEXT, album_quality TEXT);
      CREATE TABLE business_dna (user_id INTEGER, dna_json TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT, caption TEXT, hashtags TEXT,
        status TEXT, media_type TEXT, source_topic TEXT, source_angle TEXT, tipo TEXT, strategy_why TEXT, week_key TEXT, needs_review INTEGER);
      CREATE TABLE day_stops (user_id INTEGER NOT NULL, day_key TEXT NOT NULL, post_id INTEGER, origen TEXT NOT NULL DEFAULT 'dueno_pausa', created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, day_key));
      INSERT INTO users (id, plan, plan_status) VALUES (105, 'esencial', 'trial');
      INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (105, 'Panadería La Prueba', 'panaderia', 'panaderialaprueba');
    `);
    return d;
  }
  function seedFeed(mediaDir) {
    const drafts = [];
    for (let i = 1; i <= 3; i++) {
      const f = path.join(mediaDir, `hero${i}.jpg`);
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:duration=1:rate=1', '-frames:v', '1', f], { stdio: 'ignore' });
      drafts.push({ image_path: `/media/hero${i}.jpg`, caption: `Posteo ${i} de la semana en Panadería La Prueba`, hashtags: '#panaderia', source_topic: 'Medialunas', source_angle: '', tipo: 'post' });
    }
    return drafts;
  }
  const CAP_703 = 'Buen día ☀️ abrimos de 9 a 20, como todos los días. Café recién hecho y medialunas tibias toda la mañana.';
  const seed703 = (d, conMarca) => {
    d.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, status, media_type, tipo, strategy_why, week_key, needs_review)
      VALUES (703, 105, '/media/reel-703.mp4', ?, '#panaderia', 'cancelled', 'video', 'novedad', 'Reel automático de la semana', ?, 0)`).run(CAP_703, WK);
    if (conMarca) d.prepare(`INSERT INTO day_stops (user_id, day_key, post_id, origen) VALUES (105, '2026-11-18', 703, 'dueno_descarte')`).run();
  };
  const videosVivos = (d) => d.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 105 AND media_type = 'video' AND status != 'cancelled'`).get().n;
  try {
    // B1 — el dueño descartó el reel de la semana: no nace la copia.
    {
      const d = buildExtrasDb();
      const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-b1-'));
      const drafts = seedFeed(mediaDir);
      seed703(d, true);
      const totalAntes = d.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 105').get().n;
      const r = await storyReel.generateWeekExtras({ db: d, uid: 105, weekKey: WK, tag: 'suite-b1', mediaDir, feedDrafts: drafts, needsReview: false });
      t('B1 el reel descartado por el dueño NO se regenera (sin 714)',
        r.reels === 0 && videosVivos(d) === 0 && d.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 105').get().n === totalAntes,
        JSON.stringify(r));
      t('B1b el cupo se declara cubierto (already)', r.already === true, JSON.stringify(r));
    }
    // B2 — el mismo reel cancelado SIN la marca del dueño (la vía
    // admin de siempre): el cupo se repone — el tradeoff declarado,
    // en ejecutable.
    {
      const d = buildExtrasDb();
      const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-b2-'));
      const drafts = seedFeed(mediaDir);
      seed703(d, false);
      const r = await storyReel.generateWeekExtras({ db: d, uid: 105, weekKey: WK, tag: 'suite-b2', mediaDir, feedDrafts: drafts, needsReview: false });
      t('B2 sin marca del dueño, el cupo se repone como siempre (reels=1)',
        r.reels === 1 && videosVivos(d) === 1, JSON.stringify(r));
    }
    // B3 — control: sin descarte, la semana genera su reel.
    {
      const d = buildExtrasDb();
      const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-b3-'));
      const drafts = seedFeed(mediaDir);
      const r = await storyReel.generateWeekExtras({ db: d, uid: 105, weekKey: WK, tag: 'suite-b3', mediaDir, feedDrafts: drafts, needsReview: false });
      t('B3 control: sin descarte, el reel de la semana se genera',
        r.reels === 1 && videosVivos(d) === 1, JSON.stringify(r));
    }
  } catch (e) {
    t('B excepción: ' + e.message, false);
  }

  // -------------------------------------------------------------------
  seccion('C · boot real: el descarte del dueño frena el día');
  const { dayKeyInTz } = require('./morning-post-push');
  const hoy = dayKeyInTz(new Date(), TZ);
  const DATA = fs.mkdtempSync(path.join(ROOT, '.tmp-descarte-'));
  const PORT = 18777;
  const BASE = `http://127.0.0.1:${PORT}`;
  execFileSync('node', [__filename], { cwd: ROOT, env: { ...process.env, DESCARTE_SEED: '1', DATA_DIR: DATA }, stdio: 'pipe' });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), ADMIN_TOKEN: 'suite-descarte', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const dbFile = path.join(DATA, 'posta.db');
  const q1 = (sql, ...p) => { const d = new DatabaseSync(dbFile, { readOnly: true }); try { return d.prepare(sql).get(...p); } finally { d.close(); } };
  const qAll = (sql, ...p) => { const d = new DatabaseSync(dbFile, { readOnly: true }); try { return d.prepare(sql).all(...p); } finally { d.close(); } };
  async function waitBoot(tries = 90) {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  async function login(email) {
    const rr = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'suite-pass' }),
    });
    const cookie = (rr.headers.get('set-cookie') || '').split(';')[0];
    return { status: rr.status, cookie };
  }
  async function api(cookie, method, p, body) {
    const rr = await fetch(BASE + p, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await rr.json(); } catch (e) {}
    return { status: rr.status, data };
  }
  async function lastResult(cookie, despuesDe) {
    for (let i = 0; i < 60; i++) {
      const r = await api(cookie, 'GET', '/api/week/last-result');
      if (r.data && r.data.has && r.data.result && (r.data.result.at || 0) >= despuesDe) return r.data.result;
      await new Promise((res) => setTimeout(res, 400));
    }
    return null;
  }
  try {
    t('C0 boot: el server levanta', await waitBoot(), srvLog.slice(-400));
    const ses12 = await login('dueno@posty.app');
    const ses13 = await login('control@posty.app');
    const ses14 = await login('borra@posty.app');
    t('C0b login de las tres cuentas', !!(ses12.cookie && ses13.cookie && ses14.cookie),
      `12:${ses12.status} 13:${ses13.status} 14:${ses14.status}`);

    // C1–C3 · la cuenta del dueño (fixture 725): Saltar el posteo de hoy.
    const rc = await api(ses12.cookie, 'PATCH', '/api/posts/7250', { action: 'cancel' });
    t('C1 el dueño cancela el posteo de hoy (200)', rc.status === 200, JSON.stringify(rc.data).slice(0, 160));
    const stop12 = q1('SELECT * FROM day_stops WHERE user_id = 12 AND day_key = ?', hoy);
    t('C2 el día quedó frenado con origen dueno_descarte',
      !!stop12 && stop12.origen === 'dueno_descarte' && Number(stop12.post_id) === 7250,
      JSON.stringify(stop12));
    const nAntes = q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = 12').n;
    const t0 = Date.now();
    await api(ses12.cookie, 'POST', '/api/week/ensure', {});
    const lr12 = await lastResult(ses12.cookie, t0);
    t('C3 el ensure responde dia_frenado_dueno (no genera reemplazo)',
      !!lr12 && lr12.reason === 'dia_frenado_dueno', JSON.stringify(lr12));
    const p7251 = q1('SELECT status FROM posts WHERE id = 7251');
    t('C3b ni se creó un posteo nuevo ni se promovió el borrador de hoy',
      q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = 12').n === nAntes && p7251 && p7251.status === 'draft',
      JSON.stringify(p7251));

    // C4 · el gesto deliberado del dueño rearma su propio día.
    const t1 = Date.now();
    await api(ses12.cookie, 'POST', '/api/week/ensure', { armar: 1 });
    const lr12b = await lastResult(ses12.cookie, t1);
    const p7251b = q1('SELECT status FROM posts WHERE id = 7251');
    const stop12b = q1('SELECT * FROM day_stops WHERE user_id = 12 AND day_key = ?', hoy);
    t('C4 «Que Posty lo arme» limpia el stop y el borrador se programa',
      !!lr12b && lr12b.ok === true && p7251b && p7251b.status === 'scheduled' && !stop12b,
      JSON.stringify({ lr: lr12b, post: p7251b, stop: stop12b }));

    // C5 · DELETE: la fila desaparece, el freno del día queda.
    const rd = await api(ses14.cookie, 'DELETE', '/api/posts/7254');
    t('C5 el dueño elimina el posteo de hoy (200)', rd.status === 200, JSON.stringify(rd.data).slice(0, 160));
    const stop14 = q1('SELECT * FROM day_stops WHERE user_id = 14 AND day_key = ?', hoy);
    t('C5b la fila se borró y el día quedó frenado (dueno_descarte)',
      !q1('SELECT id FROM posts WHERE id = 7254') && !!stop14 && stop14.origen === 'dueno_descarte',
      JSON.stringify(stop14));
    const t2 = Date.now();
    await api(ses14.cookie, 'POST', '/api/week/ensure', {});
    const lr14 = await lastResult(ses14.cookie, t2);
    const p7255 = q1('SELECT status FROM posts WHERE id = 7255');
    t('C5c el ensure no resucita el eliminado: dia_frenado_dueno y el borrador sigue borrador',
      !!lr14 && lr14.reason === 'dia_frenado_dueno' && p7255 && p7255.status === 'draft',
      JSON.stringify({ lr: lr14, post: p7255 }));

    // C6 · control: sin descarte, el día se arma como siempre.
    const t3 = Date.now();
    await api(ses13.cookie, 'POST', '/api/week/ensure', {});
    const lr13 = await lastResult(ses13.cookie, t3);
    const p7253 = q1('SELECT status FROM posts WHERE id = 7253');
    t('C6 control: sin descarte, el ensure programa el borrador de hoy',
      !!lr13 && lr13.ok === true && p7253 && p7253.status === 'scheduled' && qAll('SELECT * FROM day_stops WHERE user_id = 13').length === 0,
      JSON.stringify({ lr: lr13, post: p7253 }));
  } catch (e) {
    t('C excepción: ' + e.message, false, srvLog.slice(-300));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\nTOTAL: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('suite:', e); process.exit(1); });
