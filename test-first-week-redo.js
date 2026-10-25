'use strict';
/* test-first-week-redo.js — (ARMA TODO · ítem 3, 2026-10-24)
 * Garantía de primera semana: «Si tu primera semana no te convence, te la
 * rehacemos entera, gratis.» Sin registro durable no hay promesa: el
 * registro es week-redo.js (tabla first_week_redo).
 *
 * Parte A: unidad del módulo con DB sqlite en memoria (node:sqlite, el
 *   patrón de test-stripe-billing): grant idempotente, available SOLO en
 *   la semana del grant, used tras consume, expired la semana siguiente,
 *   sin grant para no-activos, derivación de la semana de activación
 *   desde el primer evento de pago (events.payment_ok /
 *   funnel_events.subscribed) y fallback declarado a la semana actual.
 * Parte B: estáticos de wiring — los 3 puntos de activación llaman al
 *   grant (Stripe onActivated, webhook MP authorized,
 *   billing-sync.reconcilePending), el POST chequea el cap de IA ANTES
 *   del descarte, el descarte usa status='cancelled' (el mecanismo de la
 *   casa: sale de la ocupación, queda en «Tu archivo») SOLO sobre
 *   no-publicados, y el copy exacto ES/EN vive en la landing (app.js +
 *   index.html), en /en y en chunk-ajustes. Canario HEADLINE_INFINITIVES.
 * Parte C: integración liviana — bootea el server real (patrón
 *   test-accept-week-quota), siembra un activo con su semana y verifica
 *   el ciclo GET available → POST (descarta lo no publicado de la
 *   semana, jamás lo publicado) → GET used → POST 409. La regeneración
 *   real NO gasta IA: el usuario de prueba no tiene ADN mínimo y el
 *   pipeline corta en 'no_dna' antes de generar ideas.
 * Corre con: node test-first-week-redo.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
function ok(cond, msg) { total++; if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wr = require('./week-redo');

function memDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, plan TEXT DEFAULT 'trial', plan_status TEXT DEFAULT 'trial');
           CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires');
           CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
           CREATE TABLE funnel_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, event TEXT NOT NULL, meta TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  return db;
}
function addUser(db, id, status) {
  db.prepare('INSERT INTO users (id, plan_status) VALUES (?,?)').run(id, status);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(id);
}

function partA() {
  section('A1 · grant idempotente (una fila, la weekKey original manda)');
  {
    const db = memDb(); addUser(db, 1, 'active');
    ok(wr.grantFirstWeekRedo(db, 1, '2026-10-19') === true, 'primer grant crea la fila');
    ok(wr.grantFirstWeekRedo(db, 1, '2026-10-26') === false, 'segundo grant (otra semana) NO pisa: INSERT OR IGNORE');
    const row = db.prepare('SELECT * FROM first_week_redo WHERE user_id = 1').get();
    ok(row && row.grant_week_key === '2026-10-19' && !row.used_at && row.granted_at > 0, 'la fila guarda la weekKey de activación y used_at vacío');
  }

  section('A2 · available SOLO en la semana del grant; expired después');
  {
    const db = memDb(); addUser(db, 2, 'active');
    wr.grantFirstWeekRedo(db, 2, '2026-10-19');
    ok(wr.firstRedoStatus(db, 2, '2026-10-19').state === 'available', 'en la semana del grant: available');
    ok(wr.firstRedoStatus(db, 2, '2026-10-26').state === 'expired', 'la semana siguiente: expired');
    ok(wr.firstRedoStatus(db, 2, '2026-10-19').grant_week_key === '2026-10-19', 'el status devuelve grant_week_key');
  }

  section('A3 · consume: solo si available, una sola vez');
  {
    const db = memDb(); addUser(db, 3, 'active');
    wr.grantFirstWeekRedo(db, 3, '2026-10-19');
    ok(wr.consumeFirstWeekRedo(db, 3, '2026-10-26') === false, 'consume en OTRA semana: no consume');
    ok(wr.firstRedoStatus(db, 3, '2026-10-19').state === 'available', 'sigue available tras el intento fuera de semana');
    ok(wr.consumeFirstWeekRedo(db, 3, '2026-10-19') === true, 'consume en su semana: ok');
    ok(wr.firstRedoStatus(db, 3, '2026-10-19').state === 'used', 'tras consume: used');
    ok(wr.consumeFirstWeekRedo(db, 3, '2026-10-19') === false, 'segundo consume: no (UPDATE condicional)');
  }

  section('A4 · sin garantía para no-activos (y no se crea fila)');
  {
    const db = memDb(); addUser(db, 4, 'trial');
    const st = wr.firstRedoStatus(db, 4, '2026-10-19');
    ok(st.state === 'none', 'usuario en trial: state none');
    ok(!db.prepare('SELECT * FROM first_week_redo WHERE user_id = 4').get(), 'no se creó fila para el no-activo');
  }

  section('A5 · derivación: activo sin fila hereda la semana de su primer pago');
  {
    const db = memDb(); addUser(db, 5, 'active');
    // Pago el miércoles 2026-10-21 15:00 UTC (= 12:00 ART) → su lunes es 2026-10-19.
    db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (5, 'payment_ok', '{}', '2026-10-21 15:00:00')").run();
    const st = wr.firstRedoStatus(db, 5, '2026-10-19');
    ok(st.state === 'available' && st.grant_week_key === '2026-10-19', `deriva el lunes del payment_ok (vino ${st.grant_week_key})`);
    ok(wr.firstRedoStatus(db, 5, '2026-10-26').state === 'expired', 'y la semana siguiente ya expiró');
    const db2 = memDb(); addUser(db2, 6, 'active');
    db2.prepare("INSERT INTO funnel_events (user_id, event, meta, created_at) VALUES (6, 'subscribed', 'pro', '2026-10-14 15:00:00')").run();
    const st2 = wr.firstRedoStatus(db2, 6, '2026-10-12');
    ok(st2.state === 'available' && st2.grant_week_key === '2026-10-12', 'también deriva de funnel_events.subscribed (track)');
  }

  section('A6 · fallback declarado: activo sin ningún evento → semana actual');
  {
    const db = memDb(); addUser(db, 7, 'active');
    const st = wr.firstRedoStatus(db, 7, '2026-10-19');
    ok(st.state === 'available' && st.grant_week_key === '2026-10-19', 'sin evento: la fila nace con la semana actual y está available en ella');
  }
}

function partB() {
  section('B1 · wiring: los 3 puntos de activación otorgan la garantía');
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const bsSrc = fs.readFileSync(path.join(__dirname, 'billing-sync.js'), 'utf8');
  ok(serverSrc.includes("require('./week-redo')"), 'server.js requiere week-redo');
  ok(serverSrc.includes('weekRedo.grantFirstWeekRedo(db, uid, mondayKeyOf(tzToday(userTz(uid))))'), 'grant en stripeHooks.onActivated (weekKey de server.js)');
  ok(serverSrc.includes('weekRedo.grantFirstWeekRedo(db, Number(userId), mondayKeyOf(tzToday(userTz(Number(userId)))))'), 'grant en el webhook MP authorized');
  ok(bsSrc.includes("require('./week-redo')") && bsSrc.includes('weekRedo.grantFirstWeekRedo(db, r.id)'), 'grant en billing-sync.reconcilePending');

  section('B2 · endpoints: cap ANTES de tocar, descarte solo no-publicados');
  ok(serverSrc.includes("app.get('/api/week/first-redo', requireAuth"), 'GET /api/week/first-redo autenticado');
  ok(serverSrc.includes("app.post('/api/week/first-redo', requireAuth, requireTrialValid"), 'POST /api/week/first-redo autenticado');
  const i0 = serverSrc.indexOf("app.post('/api/week/first-redo'");
  const block = serverSrc.slice(i0, i0 + 9000);
  const iCap = block.indexOf('costs.assertAiOk(uid)');
  const iConsume = block.indexOf('consumeFirstWeekRedo');
  const iDisc = block.indexOf("status = 'cancelled'");
  ok(iCap > -1 && iConsume > iCap && iDisc > iConsume, 'orden del POST: assertAiOk → consume (candado atómico) → descarte');
  const upd = block.slice(block.indexOf('UPDATE posts SET'), block.indexOf(').run(uid, grantWk'));
  ok(upd.includes("status IN ('draft','scheduled','paused','failed')"), 'el descarte cubre draft/scheduled/paused/failed');
  ok(!upd.includes('published') && !upd.includes('publishing'), 'el SQL del descarte JAMÁS toca published/publishing');
  ok(upd.includes("status = 'cancelled'") || block.includes("status = 'cancelled'"), "el descarte usa status='cancelled' (mecanismo de la casa: visible en Tu archivo)");
  ok(block.includes("generateWeekDrafts(uid, { weekKey: grantWk, tag: 'first-week-redo' })") && block.includes('started: true'), 'dispara generateWeekDrafts de la semana del grant sin bloquear (started:true)');
  ok(block.includes("r.reason === 'already_complete'") && block.includes('generateWeekExtras'), 'borde already_complete (feed 100% publicado): los extras descartados se reponen igual');

  section('B3 · copy exacto de la garantía (ES/EN) en las 3 superficies');
  const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const enSrc = fs.readFileSync(path.join(__dirname, 'public', 'en', 'index.html'), 'utf8');
  const ajSrc = fs.readFileSync(path.join(__dirname, 'public', 'chunk-ajustes.js'), 'utf8');
  const ES = 'Si tu primera semana no te convence, te la rehacemos entera, gratis.';
  const EN = "If your first week doesn't convince you, we'll redo the whole week for you, free.";
  ok(appSrc.includes(ES), 'copy ES en la sección de planes de la landing (app.js)');
  ok(idxSrc.includes(ES), 'copy ES en public/index.html');
  ok(enSrc.includes(EN), 'copy EN en public/en/index.html (sección de planes)');
  ok(ajSrc.includes(ES) && ajSrc.includes(EN), 'copy ES+EN en chunk-ajustes (Mi plan, por idioma)');

  section('B4 · front de la Agenda: botón, confirmación de un paso y toast');
  ok(appSrc.includes("api.get('/api/week/first-redo')") && appSrc.includes('firstWeekRedoCardHTML'), 'la Agenda consulta el estado y pinta la tarjeta solo si available');
  ok(appSrc.includes('↻ Rehacer mi semana') && appSrc.includes('↻ Redo my week'), 'botón «↻ Rehacer mi semana» ES/EN');
  ok(appSrc.includes('¿Rehago toda tu semana? Armo una semana nueva completa para vos. Los posteos ya publicados no se tocan.'), 'confirmación inline ES exacta');
  ok(appSrc.includes('Sí, rehacerla') && appSrc.includes('Ahora no'), 'confirmación de un paso: [Sí, rehacerla] [Ahora no]');
  ok(appSrc.includes("api.post('/api/week/first-redo', {})"), 'al confirmar: POST al endpoint');
  ok(appSrc.includes('Listo — estoy armando tu semana nueva 🎉'), 'toast ES exacto');

  section('B5 · canarios');
  const nInf = (serverSrc.match(/HEADLINE_INFINITIVES/g) || []).length;
  ok(nInf === 3, `canario HEADLINE_INFINITIVES = 3 (hay ${nInf})`);
  ok(/const BUILD_ID = '20261024-v426';/.test(serverSrc), 'BUILD_ID bumpeado a 20261024-v426');
}

async function partC() {
  section('C · integración liviana: ciclo completo contra el server real');
  const TZ = 'America/Argentina/Buenos_Aires';
  const mondayKeyOf = (ymd) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  };
  const shiftDays = (ymd, n) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };
  const THIS_MON = mondayKeyOf(new Date().toLocaleDateString('en-CA', { timeZone: TZ }));
  const NEXT_MON = shiftDays(THIS_MON, 7);
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-firstredo-'));
  const PORT = 18777;
  const BASE = `http://127.0.0.1:${PORT}`;
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-firstredo' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await sleep(500);
    }
    ok(up, 'server booteó');
    if (!up) { console.error(srvLog.slice(-1200)); return; }
    const reg = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'firstredo@example.com', password: 'test1234', business_name: 'Test First Redo' }),
    });
    ok(reg.ok, 'registro de usuario de prueba');
    const cookie = (reg.headers.getSetCookie ? reg.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    const api = async (method, p, body) => {
      const r = await fetch(BASE + p, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    db.exec('PRAGMA busy_timeout = 8000');
    const uid = db.prepare("SELECT id FROM users WHERE email = 'firstredo@example.com'").get().id;
    // Activo desde ESTA semana: el primer pago quedó el lunes 15:00 UTC.
    db.prepare("UPDATE users SET plan = 'esencial', plan_status = 'active' WHERE id = ?").run(uid);
    db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (?, 'payment_ok', '{}', ?)").run(uid, THIS_MON + ' 15:00:00');
    const seed = (status, mt, wk, cap) => Number(db.prepare(
      `INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review, week_key)
       VALUES (?,?,?,?,NULL,?,?,0,?)`).run(uid, '/media/test.jpg', cap, '', status, mt, wk).lastInsertRowid);
    const pDraft = seed('draft', 'image', THIS_MON, 'Borrador de la semana');
    const pStory = seed('scheduled', 'story', THIS_MON, 'Historia de la semana');
    const pFailed = seed('failed', 'video', THIS_MON, 'Reel fallido de la semana');
    const pPub = seed('published', 'image', THIS_MON, 'Publicado de la semana');
    const pNext = seed('draft', 'image', NEXT_MON, 'Borrador de la semana que viene');

    let r = await api('GET', '/api/week/first-redo');
    ok(r.j && r.j.state === 'available' && r.j.grant_week_key === THIS_MON,
      `GET: available con grant en esta semana ${THIS_MON} (vino ${r.j && r.j.state}/${r.j && r.j.grant_week_key})`);
    // Esperado del descarte: TODO no-publicado de la semana (los 3
    // sembrados + lo que el alta haya podido crear para esta semana).
    const preCount = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status IN ('draft','scheduled','paused','failed')
      AND (week_key = ? OR (scheduled_at IS NOT NULL AND date(scheduled_at) >= date(?) AND date(scheduled_at) < date(?, '+7 days')))`).get(uid, THIS_MON, THIS_MON, THIS_MON).n;
    ok(preCount >= 3, `hay al menos los 3 no-publicados sembrados para descartar (hay ${preCount})`);
    r = await api('POST', '/api/week/first-redo', {});
    ok(r.status === 200 && r.j && r.j.ok === true && r.j.started === true, `POST: arranca el rehacer (status ${r.status})`);
    ok(r.j && r.j.discarded === preCount, `POST: descartó todo lo no-publicado de la semana (${preCount}; vino ${r.j && r.j.discarded})`);
    const stOf = (id) => db.prepare('SELECT status FROM posts WHERE id = ?').get(id).status;
    ok(stOf(pDraft) === 'cancelled' && stOf(pStory) === 'cancelled' && stOf(pFailed) === 'cancelled',
      "los descartados quedaron en 'cancelled' (visibles en Tu archivo, no borrados)");
    ok(stOf(pPub) === 'published', 'el PUBLICADO no se tocó');
    ok(stOf(pNext) === 'draft', 'el borrador de la semana que viene no se tocó');
    r = await api('GET', '/api/week/first-redo');
    ok(r.j && r.j.state === 'used', 'GET tras el POST: used');
    r = await api('POST', '/api/week/first-redo', {});
    ok(r.status === 409, `segundo POST: 409 (la garantía es de un solo uso; vino ${r.status})`);
    await sleep(1500); // que la corrida disparada termine de cortar en no_dna, sin IA

    // ── Usuario 2: borde already_complete — feed 100% PUBLICADO (7/7) +
    // extras sin publicar. El rehacer descarta SOLO los extras, no toca
    // ningún publicado, y los extras se reponen por el fallback del POST
    // (generateWeekDrafts corta en already_complete antes de su bloque
    // de extras). Las imágenes son JPEGs reales mínimos en el MEDIA_DIR
    // del server de prueba: la historia se regenera con ffmpeg local,
    // sin IA.
    section('C2 · borde already_complete: feed publicado, extras repuestos');
    const reg2 = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'firstredo2@example.com', password: 'test1234', business_name: 'Test First Redo 2' }),
    });
    ok(reg2.ok, 'registro del usuario 2');
    const cookie2 = (reg2.headers.getSetCookie ? reg2.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    const api2 = async (method, p, body) => {
      const rr = await fetch(BASE + p, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: rr.status, j: await rr.json().catch(() => ({})) };
    };
    const uid2 = db.prepare("SELECT id FROM users WHERE email = 'firstredo2@example.com'").get().id;
    db.prepare("UPDATE users SET plan = 'pro', plan_status = 'active' WHERE id = ?").run(uid2);
    db.prepare("INSERT INTO events (user_id, name, props, created_at) VALUES (?, 'payment_ok', '{}', ?)").run(uid2, THIS_MON + ' 15:00:00');
    const JPG1 = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==', 'base64');
    fs.mkdirSync(path.join(TMP, 'media'), { recursive: true });
    const seed2 = (status, mt, cap, img) => Number(db.prepare(
      `INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review, week_key)
       VALUES (?,?,?,?,NULL,?,?,0,?)`).run(uid2, img, cap, '', status, mt, THIS_MON).lastInsertRowid);
    const pubIds = [];
    for (let i = 0; i < 7; i++) {
      const img = `/media/fr2-${i}.jpg`;
      fs.writeFileSync(path.join(TMP, 'media', `fr2-${i}.jpg`), JPG1);
      pubIds.push(seed2('published', 'image', 'Publicado ' + (i + 1), img));
    }
    const storyId = seed2('scheduled', 'story', 'Historia a rehacer', '/media/fr2-0.jpg');
    const reelId = seed2('draft', 'video', 'Reel a rehacer', '/media/fr2-1.jpg');
    r = await api2('GET', '/api/week/first-redo');
    ok(r.j && r.j.state === 'available', 'GET usuario 2: available');
    r = await api2('POST', '/api/week/first-redo', {});
    ok(r.status === 200 && r.j && r.j.discarded === 2, `POST usuario 2: descartó solo los 2 extras no-publicados (vino ${r.j && r.j.discarded})`);
    ok(stOf(storyId) === 'cancelled' && stOf(reelId) === 'cancelled', 'historia y reel quedaron descartados (cancelled)');
    ok(pubIds.every((id) => stOf(id) === 'published'), 'los 7 publicados del feed NO se tocaron');
    let newStories = 0;
    for (let i = 0; i < 24 && newStories < 1; i++) {
      await sleep(1500);
      newStories = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ? AND media_type = 'story' AND status = 'draft'`).get(uid2, THIS_MON).n;
    }
    ok(newStories >= 1, `el fallback repone los extras tras already_complete (historias nuevas: ${newStories})`);
    // La línea de log sale cuando generateWeekExtras ENTERO termina (los
    // reels van después de las historias y tardan): se la espera.
    for (let i = 0; i < 40 && !srvLog.includes('extras repuestos tras already_complete'); i++) await sleep(1500);
    ok(srvLog.includes('extras repuestos tras already_complete'), 'el server registró la reposición de extras del borde');
    db.close();
  } catch (e) {
    fails++; total++;
    console.error('  ✗ excepción en Parte C:', e.message);
    console.error(srvLog.slice(-1200));
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  try { partA(); } catch (e) { fails++; console.error('Parte A explotó:', e); }
  try { partB(); } catch (e) { fails++; console.error('Parte B explotó:', e); }
  try { await partC(); } catch (e) { fails++; console.error('Parte C explotó:', e); }
  console.log(fails === 0 ? `\nTODO VERDE ✅ (${total} checks)` : `\n${fails}/${total} FALLOS ❌`);
  process.exit(fails === 0 ? 0 : 1);
})();
