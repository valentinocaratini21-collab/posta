// test-lote-pausa-durable.js — LOTE PAUSA-DURABLE
// El relleno automático contra la pausa deliberada del dueño.
// Incidente (13/11): Valentino pausó el posteo 649 de su feed y el
// ensure del día creó un reemplazo (673) el MISMO MINUTO, agendado para
// ese día. Antecedente (586): un «no sale» del conserje volvió agendado
// por el embudo semanal en el primer día libre. Causa raíz (diagnóstico
// ~/workspace/.diag-relleno-pausa/DIAGNOSIS.md): la señal de freno era
// por POSTEO (posts.user_stopped) y la pregunta del relleno es por DÍA;
// la pausa además borra la fecha (scheduled_at=NULL), así que el día
// vaciado a propósito era indistinguible de un día libre.
// El lote: señal durable por DÍA (tabla day_stops, escrita ANTES de
// anular la fecha por la pausa del dueño y por el 'no_sale' del
// conserje, que además suma user_stopped=1) + lectores en cada camino
// que crea o agenda (ensureTodayPost — que de paso aprende a leer
// users.publishing_stopped —, scheduleDraftsPerWeek vía días ocupados,
// programarHoy como defensa, desplazamiento de Subir) + borrado del
// stop solo por gestos deliberados del dueño sobre ese día.
// Batería (la del diagnóstico, punto por punto):
//   P0 contrato en la fuente (tabla, escritores, lectores, gestos).
//   P1 replay del incidente: pausa de hoy → ensure + ritual → cero
//      creados, cero agendados para hoy; el day_stop existe.
//   P2 replay del 586: 'no_sale' del conserje para mañana → el embudo
//      automático no resucita el posteo (su query real de elegibilidad,
//      patrón test-user-stopped) ni el asignador real agenda reemplazo
//      para mañana; otro borrador sí se agenda, saltando el día frenado.
//   P3 día vacío accidental: sin day_stop, el ensure corre como
//      siempre (nunca frena con dia_frenado_dueno).
//   P4 arrepentimiento: el dueño re-programa el posteo para hoy → el
//      stop se borra y el día vuelve a operar (ensure no duplica).
//   P5 cuenta con publishing_stopped=1: el ensure no genera ni agenda.
//   P6 la tabla day_stops nace en db.js tras el CREATE de posts.
// Uso: node test-lote-pausa-durable.js (corre contra el árbol de este
// directorio; en el árbol SIN el lote — control — P0/P1/P2/P4/P5 fallan
// reproduciendo el incidente y el 586; P3 pasa en ambos).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const DBJS = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const CONS = fs.readFileSync(path.join(TREE, 'conserje-revision.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

// ---------- zona horaria segura: hora local 10–16 (el slot de las
// 19:00 de programarHoy queda en el futuro y el día no bordea medianoche)
const ZONES = ['Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Dubai', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'UTC'];
function hourIn(zone, d) {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(d)) % 24; } catch (e) { return -1; }
}
const NOW = new Date();
const TZ = ZONES.find((z) => { const h = hourIn(z, NOW); return h >= 10 && h <= 16; }) || 'UTC';
const TODAY = dayKeyInTz(NOW, TZ);
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const TOMORROW = shiftDays(TODAY, 1);
const mondayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (dt.getUTCDay() + 6) % 7; // lunes = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
};
// "YYYY-MM-DD HH:MM" de pared en TZ → ISO UTC (mismo algoritmo que
// wallToUtc de conserje-revision.js).
function wallToUtc(s, tz) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return null;
  const Y = +m[1], Mo = +m[2], D = +m[3], h = +m[4], mi = +m[5];
  const zone = tz || 'UTC';
  const guess = Date.UTC(Y, Mo - 1, D, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, (+parts.hour % 24), +parts.minute, +parts.second);
  return new Date(guess - (asUtc - guess)).toISOString();
}
const atHour = (ymd, hh) => wallToUtc(`${ymd} ${String(hh).padStart(2, '0')}:00`, TZ);
// Fecha del escenario del conserje: mañana, salvo que mañana sea el
// ÚLTIMO día de su semana (domingo) — en ese caso la semana no tiene
// día posterior donde el asignador pueda ubicar al otro borrador y el
// replay no probaría nada. Se corre un día (queda lunes, semana entera
// por delante).
const FECHA_NO_SALE = (mondayOf(TOMORROW) === shiftDays(TOMORROW, -6)) ? shiftDays(TOMORROW, 1) : TOMORROW;


// ================= P0 · contrato en la fuente =================
function parteFuente() {
  console.log('\n== P0 · contrato en la fuente ==');
  const iPosts = DBJS.indexOf('CREATE TABLE IF NOT EXISTS posts (');
  const iStops = DBJS.indexOf('CREATE TABLE IF NOT EXISTS day_stops (');
  const iVers = DBJS.indexOf('CREATE TABLE IF NOT EXISTS post_versions (');
  t('P0.1 db.js crea day_stops DESPUÉS del CREATE de posts y antes de post_versions', iPosts > 0 && iStops > iPosts && (iVers < 0 || iStops < iVers),
    `posts=${iPosts} stops=${iStops} versions=${iVers}`);
  t('P0.2 day_stops es por (user_id, day_key) con origen', /day_stops \([\s\S]*?PRIMARY KEY \(user_id, day_key\)/.test(DBJS) && DBJS.includes("origen TEXT NOT NULL DEFAULT 'dueno_pausa'"));
  t('P0.3 server.js define los helpers dayStopGet/Set/Clear/Set', ['function dayStopGet(', 'function dayStopSet(', 'function dayStopClear(', 'function dayStopsSet('].every((s) => SRV.includes(s)));
  const iUns = SRV.indexOf("action === 'unschedule'");
  const unsSlice = iUns > 0 ? SRV.slice(iUns, iUns + 1400) : '';
  t('P0.4 la pausa captura el día ANTES del UPDATE y escribe el stop (dueno_pausa)',
    unsSlice.includes('ymdInTz(post.scheduled_at') && unsSlice.indexOf('ymdInTz(post.scheduled_at') < unsSlice.indexOf('scheduled_at=NULL')
    && unsSlice.includes("dayStopSet(req.session.userId, diaFrenado, post.id, 'dueno_pausa')"));
  const iEns = SRV.indexOf('async function ensureTodayPost(');
  const ensSlice = iEns > 0 ? SRV.slice(iEns, iEns + 3200) : '';
  t('P0.5 ensureTodayPost frena por publishing_stopped y por dia_frenado_dueno ANTES de rescatar/generar',
    ensSlice.includes("reason: 'publishing_stopped'") && ensSlice.includes("reason: 'dia_frenado_dueno'")
    && ensSlice.indexOf("reason: 'dia_frenado_dueno'") < ensSlice.indexOf('// 1) Programado hoy'));
  const iProg = SRV.indexOf('function programarHoy(');
  t('P0.6 programarHoy abre con la guarda del día frenado', iProg > 0 && SRV.slice(iProg, iProg + 500).includes('if (dayStopGet(uid, hoy)) return null;'));
  const iSdw = SRV.indexOf('function scheduleDraftsPerWeek(');
  const sdwSlice = iSdw > 0 ? SRV.slice(iSdw, iSdw + 2600) : '';
  t('P0.7 scheduleDraftsPerWeek suma los días frenados a los ocupados', sdwSlice.includes('dayStopsSet(uid)') && sdwSlice.includes('taken.add(dkStop)'));
  t('P0.8 el desplazamiento de Subir salta los días frenados', SRV.includes('if (stops.has(d)) continue;') && SRV.includes('const stops = dayStopsSet(uid);'));
  const iNo = CONS.indexOf("decision === 'no_sale'");
  const noSlice = iNo > 0 ? CONS.slice(iNo, iNo + 1500) : '';
  t('P0.9 el no_sale del conserje unifica el gesto: user_stopped=1 + day_stop conserje_no_sale',
    noSlice.includes('user_stopped = 1') && noSlice.includes("dayStopSetC(db, uid, fecha, post.id, 'conserje_no_sale')"));
  const iPed = CONS.indexOf("decision === 'pedir'");
  t('P0.10 el pedir del conserje borra el stop de la fecha', iPed > 0 && CONS.slice(iPed, iPed + 700).includes('dayStopClearC(db, uid, fecha)'));
  t('P0.11 programar/aceptar a mano borra el stop del día destino (arrepentimiento)',
    SRV.includes('dayStopClear(req.session.userId, dkProg)') && SRV.includes('dayStopClear(uid, dkAcc)'));
}

// ================= boot del servidor real =================
const PORT = 34613;
const SECRET = 'pausa-durable-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pausa-durable-'));
const NODE_MODULES = '/home/hatch/workspace/posta/node_modules';
const FIXTURE_JPG = path.join(TREE, 'stock', 'barberia', '2061820.jpg');

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
const cookieFor = (sid) => 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
async function api(method, pth, sid, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${pth}`, {
    method,
    headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j, headers: r.headers };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lastReason(sid, tries) {
  for (let i = 0; i < (tries || 10); i++) {
    const r = await api('GET', '/api/week/last-result', sid);
    const rr = r.json && r.json.result;
    if (r.json && r.json.has && rr && rr.reason) return rr.reason;
    await sleep(1000);
  }
  return null;
}

(async () => {
  parteFuente();
  console.log('\n== boot ==');
  console.log('zona de la batería:', TZ, '| hoy:', TODAY, '| mañana:', TOMORROW);
  fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
  fs.copyFileSync(FIXTURE_JPG, path.join(tmpDir, 'media', 'fixture.jpg'));
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-pausa-durable',
    SESSION_SECRET: SECRET,
    NODE_PATH: NODE_MODULES,
    OPENAI_API_KEY: 'test',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  process.on('exit', kill);
  const dbFile = path.join(tmpDir, 'posta.db');
  const openDb = () => new DatabaseSync(dbFile);
  try {
    let up = false;
    for (let i = 0; i < 45 && !up; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) up = true; } catch (e) {}
      if (!up) await sleep(1000);
    }
    t('boot: el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }

    // ---------- siembra de cuentas ----------
    const bcrypt = require(path.join(NODE_MODULES, 'bcryptjs'));
    const db0 = openDb();
    const insUser = db0.prepare(`INSERT INTO users (id, email, password_hash, plan_status) VALUES (?, ?, ?, 'active')`);
    const insSet = db0.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
    const insProf = db0.prepare(`INSERT INTO profiles (user_id, business_name, description) VALUES (?, ?, ?)`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({ cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' }, userId: uid });
    const insSess = db0.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`);
    const DESC = 'Negocio de prueba de la batería pausa-durable: vendemos café de especialidad y pastelería casera todos los días.';
    for (const uid of [101, 102, 103, 104, 105]) {
      insUser.run(uid, `pd-${uid}@test.invalid`, bcrypt.hashSync('pd-pass-' + uid, 10));
      insSet.run(uid, TZ);
      insProf.run(uid, 'Negocio PD ' + uid, DESC);
      insSess.run('pd-' + uid, sessJson(uid), exp);
    }
    db0.prepare(`UPDATE users SET publishing_stopped = 1 WHERE id = 104`).run();
    const insPost = db0.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, week_key) VALUES (?, ?, '/media/fixture.jpg', ?, '', ?, ?, 'image', ?)`);
    const CAP = 'El café de la casa, recién hecho, como todos los días de esta semana.';
    // P1: posteo de hoy agendado (9001) + borrador fresco de hoy (9002).
    insPost.run(9001, 101, CAP, atHour(TODAY, 21), 'scheduled', mondayOf(TODAY));
    insPost.run(9002, 101, CAP, null, 'draft', mondayOf(TODAY));
    // P2: el de la fecha del conserje (9003) + otro borrador de su semana (9004).
    insPost.run(9003, 102, CAP, atHour(FECHA_NO_SALE, 19), 'scheduled', mondayOf(FECHA_NO_SALE));
    insPost.run(9004, 102, CAP, null, 'draft', mondayOf(FECHA_NO_SALE));
    // P5: borrador fresco de hoy en la cuenta frenada (9006).
    insPost.run(9006, 104, CAP, null, 'draft', mondayOf(TODAY));
    // P4: posteo de hoy del usuario que se arrepiente (9005).
    insPost.run(9005, 105, CAP, atHour(TODAY, 21), 'scheduled', mondayOf(TODAY));
    db0.close();
    const q = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).all(...args); d.close(); return r; };
    const q1 = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).get(...args); d.close(); return r; };
    const dayOfPost = (id) => { const p = q1('SELECT scheduled_at FROM posts WHERE id = ?', id); return p && p.scheduled_at ? dayKeyInTz(new Date(String(p.scheduled_at).replace(' ', 'T')), TZ) : null; };
    const stopRow = (uid, day) => { try { return q1('SELECT * FROM day_stops WHERE user_id = ? AND day_key = ?', uid, day) || null; } catch (e) { return null; } };
    const hasStopsTable = () => { try { return !!q1(`SELECT name FROM sqlite_master WHERE type='table' AND name='day_stops'`); } catch (e) { return false; } };

    // ================= P1 · replay del incidente =================
    console.log('\n== P1 · pausa de hoy → ningún relleno la reemplaza ==');
    const patch1 = await api('PATCH', '/api/posts/9001', 'pd-101', { action: 'unschedule' });
    t('P1.1 la pausa responde 200', patch1.status === 200, 'status=' + patch1.status);
    const p9001 = q1('SELECT * FROM posts WHERE id = 9001');
    t('P1.2 el pausado queda borrador, sin fecha y con user_stopped=1 (como siempre)',
      p9001.status === 'draft' && !p9001.scheduled_at && Number(p9001.user_stopped) === 1,
      JSON.stringify({ s: p9001.status, at: p9001.scheduled_at, us: p9001.user_stopped }));
    t('P6.1 la tabla day_stops existe en la DB del boot', hasStopsTable());
    const st1 = stopRow(101, TODAY);
    t('P1.3 el día quedó frenado: day_stops(101, hoy) origen dueno_pausa',
      !!st1 && st1.origen === 'dueno_pausa' && Number(st1.post_id) === 9001,
      'row=' + JSON.stringify(st1));
    await api('POST', '/api/week/ensure', 'pd-101', {});
    await sleep(4000);
    const reason1 = await lastReason('pd-101', 8);
    t('P1.4 el ensure reporta dia_frenado_dueno', reason1 === 'dia_frenado_dueno', 'reason=' + reason1);
    const p9002 = q1('SELECT * FROM posts WHERE id = 9002');
    t('P1.5 el borrador fresco NO se programó de reemplazo (sigue borrador)', p9002.status === 'draft' && !p9002.scheduled_at,
      JSON.stringify({ s: p9002.status, at: p9002.scheduled_at }));
    const schedHoy101 = q(`SELECT id FROM posts WHERE user_id = 101 AND status = 'scheduled'`).filter((p) => dayOfPost(p.id) === TODAY);
    t('P1.6 cero agendados para hoy en la cuenta', schedHoy101.length === 0, 'ids=' + schedHoy101.map((p) => p.id).join(','));
    const total101 = q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = 101').n;
    t('P1.7 cero posteos nuevos creados (siguen siendo 2)', total101 === 2, 'n=' + total101);

    // ================= P2 · replay del 586 =================
    console.log('\n== P2 · no_sale del conserje → el embudo no resucita ni reemplaza ==');
    const rev = require(path.join(TREE, 'conserje-revision.js'));
    const dbC = openDb();
    let dNo = null, revErr = '';
    try { dNo = rev.decidirRevision(dbC, { user_id: 102, fecha_posteo: FECHA_NO_SALE, post_id: 9003, decision: 'no_sale', nota: 'no es el producto' }); }
    catch (e) { revErr = e.message; }
    dbC.close();
    t('P2.1 la decisión no_sale se aplica', !!(dNo && dNo.ok), 'r=' + JSON.stringify(dNo).slice(0, 200) + ' ' + revErr);
    const p9003 = q1('SELECT * FROM posts WHERE id = 9003');
    t('P2.2 el no_sale queda borrador rechazado, sin fecha y CON user_stopped=1 (gesto unificado)',
      p9003.status === 'draft' && p9003.approval === 'rejected' && !p9003.scheduled_at && Number(p9003.user_stopped) === 1,
      JSON.stringify({ s: p9003.status, a: p9003.approval, at: p9003.scheduled_at, us: p9003.user_stopped }));
    const st2 = stopRow(102, FECHA_NO_SALE);
    t('P2.3 la fecha quedó frenada: day_stops(102, fecha) origen conserje_no_sale',
      !!st2 && st2.origen === 'conserje_no_sale', 'row=' + JSON.stringify(st2));
    // La batería del embudo automático (scheduleAllDrafts, el que
    // disparan login/regla-24h/sweep sin que el dueño pida nada) se
    // simula como lo hace test-user-stopped.js: con su QUERY REAL
    // extraída de server.js corrida contra la DB viva del boot — es la
    // puerta de elegibilidad exacta del embudo. Y el asignador real
    // (scheduleDraftsPerWeek) se ejercita con POST schedule-all: es el
    // mismo código que asigna los días dentro del embudo.
    const mFun = SRV.match(/function scheduleAllDrafts\(uid\) \{[\s\S]*?db\.prepare\(`(SELECT \* FROM posts[^`]*)`\)\.all\(uid\)/);
    t('P2.4 la query del embudo automático es extraíble de server.js', !!mFun);
    if (mFun) {
      const elig = q(mFun[1], 102).map((r) => r.id);
      t('P2.5 el embudo automático NO ve al posteo del no_sale (9003 fuera)', !elig.includes(9003), 'ids=' + elig.join(','));
      t('P2.6 el embudo automático SÍ ve al otro borrador (9004 dentro)', elig.includes(9004), 'ids=' + elig.join(','));
    }
    const p9003b = q1('SELECT * FROM posts WHERE id = 9003');
    t('P2.7 tras la batería del embudo, el no_sale sigue borrador rechazado sin fecha',
      p9003b.status === 'draft' && p9003b.approval === 'rejected' && !p9003b.scheduled_at,
      JSON.stringify({ s: p9003b.status, a: p9003b.approval, at: p9003b.scheduled_at }));
    const sa = await api('POST', '/api/posts/schedule-all', 'pd-102', {});
    t('P2.8 el asignador real corre (schedule-all → scheduleDraftsPerWeek)', sa.status === 200, 'status=' + sa.status + ' body=' + JSON.stringify(sa.json).slice(0, 160));
    const p9004b = q1('SELECT status FROM posts WHERE id = 9004');
    t('P2.9 el otro borrador (9004) sí quedó agendado por el asignador', p9004b.status === 'scheduled', 's=' + p9004b.status);
    t('P2.10 el 9004 NO cayó en el día frenado', dayOfPost(9004) !== FECHA_NO_SALE, 'dia=' + dayOfPost(9004));
    const feedManana102 = q(`SELECT id FROM posts WHERE user_id = 102 AND status = 'scheduled' AND media_type IN ('image','carousel')`).filter((p) => dayOfPost(p.id) === FECHA_NO_SALE);
    t('P2.11 ningún reemplazo quedó agendado para la fecha frenada', feedManana102.length === 0, 'ids=' + feedManana102.map((p) => p.id).join(','));

    // ================= P3 · día vacío accidental =================
    // La cuenta 103 tiene un borrador fresco de hoy (9007) y NINGÚN
    // gesto de freno: el ensure tiene que rescatarlo y programarlo
    // para hoy exactamente como antes del lote (paso 2 del ensure).
    console.log('\n== P3 · día vacío NO deliberado: el relleno vigente sigue ==');
    { const dI = openDb(); dI.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, week_key) VALUES (9007, 103, '/media/fixture.jpg', ?, '', NULL, 'draft', 'image', ?)`).run(CAP, mondayOf(TODAY)); dI.close(); }
    await api('POST', '/api/week/ensure', 'pd-103', {});
    await sleep(3000);
    const reason3 = await lastReason('pd-103', 12);
    t('P3.1 el ensure NO frena con dia_frenado_dueno (no hay stop: corre como siempre)',
      reason3 !== null && reason3 !== 'dia_frenado_dueno', 'reason=' + reason3);
    const p9007 = q1('SELECT * FROM posts WHERE id = 9007');
    t('P3.2 el borrador del día vacío accidental SÍ se programó para hoy (relleno intacto)',
      p9007.status === 'scheduled' && dayOfPost(9007) === TODAY,
      JSON.stringify({ s: p9007.status, dia: dayOfPost(9007) }));
    t('P3.3 no se escribió ningún day_stop para la cuenta', !stopRow(103, TODAY));

    // ================= P5 · cuenta frenada =================
    console.log('\n== P5 · publishing_stopped: el ensure no genera ni agenda ==');
    await api('POST', '/api/week/ensure', 'pd-104', {});
    await sleep(3000);
    const reason5 = await lastReason('pd-104', 10);
    t('P5.1 el ensure reporta publishing_stopped', reason5 === 'publishing_stopped', 'reason=' + reason5);
    const p9006 = q1('SELECT * FROM posts WHERE id = 9006');
    t('P5.2 el borrador de la cuenta frenada NO se programó', p9006.status === 'draft' && !p9006.scheduled_at,
      JSON.stringify({ s: p9006.status, at: p9006.scheduled_at }));
    const total104 = q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = 104').n;
    t('P5.3 cero posteos nuevos en la cuenta frenada', total104 === 1, 'n=' + total104);

    // ================= P4 · arrepentimiento =================
    console.log('\n== P4 · el dueño se arrepiente: programa de nuevo y el día opera ==');
    await api('PATCH', '/api/posts/9005', 'pd-105', { action: 'unschedule' });
    const st4a = stopRow(105, TODAY);
    t('P4.1 la pausa escribió el stop del día', !!st4a && st4a.origen === 'dueno_pausa', 'row=' + JSON.stringify(st4a));
    const re = await api('PATCH', '/api/posts/9005', 'pd-105', { scheduled_at: atHour(TODAY, 21) });
    t('P4.2 re-programar el mismo posteo para hoy responde 200', re.status === 200, 'status=' + re.status + ' body=' + JSON.stringify(re.json).slice(0, 160));
    const p9005 = q1('SELECT * FROM posts WHERE id = 9005');
    t('P4.3 el posteo volvió a agendado para hoy, sin marca de freno',
      p9005.status === 'scheduled' && dayOfPost(9005) === TODAY && Number(p9005.user_stopped) === 0,
      JSON.stringify({ s: p9005.status, dia: dayOfPost(9005), us: p9005.user_stopped }));
    t('P4.4 el stop del día se borró con el gesto', !stopRow(105, TODAY));
    const ens105 = await api('POST', '/api/week/ensure', 'pd-105', {});
    t('P4.5 el ensure ve el día completo (no duplica)', !!(ens105.json && ens105.json.complete === true && ens105.json.count === 1),
      'body=' + JSON.stringify(ens105.json).slice(0, 200));
    const total105 = q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = 105').n;
    t('P4.6 sigue habiendo un solo posteo en la cuenta', total105 === 1, 'n=' + total105);
  } catch (e) {
    fail++; console.log('FAIL excepción de la batería: ' + e.message);
    console.log(out.split('\n').slice(-25).join('\n'));
  } finally {
    kill();
    await sleep(600);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail ? 1 : 0);
})();
