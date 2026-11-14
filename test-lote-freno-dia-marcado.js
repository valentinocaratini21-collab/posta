// test-lote-freno-dia-marcado.js — LOTE FRENO-DIA-MARCADO
// El freno de SOPORTE también marca el día.
// Causa raíz (incidente 679, 14/11 — replay del 673 del 13/11): el
// rehacer de soporte (POST /api/admin/support/posts/:id/rehacer →
// support-cases.redoPost) pasaba un posteo PROGRAMADO a borrador
// anulando scheduled_at SIN dejar marca en el día. La pausa del dueño
// dentro de la app sí escribe day_stops (LOTE PAUSA-DURABLE) y el
// ensure la respeta; el freno de soporte no escribía nada, así que el
// día vaciado a propósito era indistinguible de un día libre y
// ensureTodayPost imponía un reemplazo (14/11: video 653 frenado por
// soporte a las 13:08 EST; 13:53, al abrir la app, el ensure ya había
// generado el reemplazo genérico 679 para las 19:00).
// El lote: la rama 'scheduled' de redoPost captura el día ANTES de
// anular la fecha (mismo gesto que la pausa del dueño) y escribe el
// stop con origen 'soporte_rehacer' (espejo dayStopSetS en
// support-cases.js, INSERT OR IGNORE: un stop previo del dueño o del
// conserje no se pisa). El stop se levanta con los gestos deliberados
// del dueño de siempre (los borradores de server.js borran por
// (user_id, day_key) sin mirar el origen). La rama de borrador en
// revisión (rechazar + regenerar) NO se toca; las historias no frenan
// el día del feed (misma regla que la pausa del dueño).
// Batería:
//   F0 contrato en la fuente (escritor nuevo, rama intacta, ruta).
//   F1 replay del 679: freno de soporte sobre el posteo de HOY →
//      dia_marcado = hoy, stop soporte_rehacer, el ensure reporta
//      dia_frenado_dueno y NO programa reemplazo ni crea posteos.
//   F2 freno sobre el posteo de MAÑANA → su día también marcado; el
//      asignador semanal no agenda al otro borrador en ese día y el
//      stop sobrevive al schedule-all.
//   F3 arrepentimiento por Subir: tras el freno de soporte, el dueño
//      sube una foto que cae HOY → se postea hoy y la marca se levanta.
//   F4 la pausa del dueño sigue escribiendo su stop (dueno_pausa),
//      byte-funcional.
//   F5 la rama de borrador en revisión queda intacta: rehacer →
//      'regenerar', sin dia_marcado y sin stop.
//   F6 una historia programada frenada por soporte vuelve a borrador
//      SIN marcar el día del feed.
// Uso: node test-lote-freno-dia-marcado.js (corre contra el árbol de
// este directorio; en el árbol SIN el lote — control — F0/F1/F2/F3
// fallan reproduciendo el incidente y F4/F5/F6 pasan en ambos).
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
const SC = fs.readFileSync(path.join(TREE, 'support-cases.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

// ---------- zona horaria segura: hora local 10–16 (el slot de las
// 19:00/21:00 del día queda en el futuro y el día no bordea medianoche)
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
// Día del escenario F2: mañana, salvo que mañana sea el ÚLTIMO día de
// su semana (domingo) — el asignador semanal nunca agenda hoy y su
// semana terminaría en el propio día frenado: no quedaría día libre
// donde probar que salta el frenado (misma salvedad que la batería de
// pausa-durable). Se corre un día (queda lunes, semana entera libre).
const DIA_F2 = (mondayOf(TOMORROW) === shiftDays(TOMORROW, -6)) ? shiftDays(TOMORROW, 1) : TOMORROW;

// ================= F0 · contrato en la fuente =================
function parteFuente() {
  console.log('\n== F0 · contrato en la fuente ==');
  t('F0.1 support-cases.js define el espejo dayStopSetS con origen soporte_rehacer (INSERT OR IGNORE)',
    SC.includes('function dayStopSetS(') && SC.includes('INSERT OR IGNORE INTO day_stops') && SC.includes("'soporte_rehacer'"));
  const iSch = SC.indexOf("if (post.status === 'scheduled') {", SC.indexOf('function redoPost('));
  const schSlice = iSch > 0 ? SC.slice(iSch, iSch + 2200) : '';
  t('F0.2 la rama scheduled captura el día ANTES de anular la fecha y escribe el stop',
    iSch > 0 && schSlice.includes('toMs(post.scheduled_at)')
    && schSlice.indexOf('toMs(post.scheduled_at)') < schSlice.indexOf('scheduled_at = NULL')
    && schSlice.includes('dayStopSetS(db, post.user_id, diaFrenado, post.id)')
    && schSlice.includes("post.media_type !== 'story'"),
    'slice=' + schSlice.slice(0, 120));
  const iRev = SC.indexOf("if (post.status === 'draft' && Number(post.needs_review || 0) === 1) {");
  const revSlice = iRev > 0 ? SC.slice(iRev, iRev + 2400) : '';
  t('F0.3 la rama de borrador en revisión NO toca day_stops (regenerar intacto)',
    iRev > 0 && !revSlice.includes('dayStopSetS') && revSlice.includes("modo: 'regenerar'"));
  t('F0.4 la ruta admin del rehacer devuelve dia_marcado',
    SRV.includes('dia_marcado: r.dia_marcado || null'));
  t('F0.5 db.js documenta el origen soporte_rehacer', DBJS.includes("'soporte_rehacer'"));
  t('F0.6 los lectores del stop siguen siendo los de pausa-durable (ensure + programarHoy + asignador)',
    SRV.includes("if (dayStopGet(uid, hoy)) return { ok: false, reason: 'dia_frenado_dueno' }")
    && SRV.includes('if (dayStopGet(uid, hoy)) return null;')
    && SRV.includes('for (const dkStop of dayStopsSet(uid)) taken.add(dkStop);'));
}

// ================= boot del servidor real =================
const PORT = 34647;
const SECRET = 'freno-dia-secret';
const ADMIN = 'boot-test-token-freno-dia';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freno-dia-'));
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
async function adminPost(pth, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${pth}?token=${ADMIN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
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
  console.log('zona de la batería:', TZ, '| hoy:', TODAY, '| mañana:', TOMORROW, '| día F2:', DIA_F2);
  fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
  fs.copyFileSync(FIXTURE_JPG, path.join(tmpDir, 'media', 'fixture.jpg'));
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: ADMIN,
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
    const DESC = 'Negocio de prueba de la batería freno-dia-marcado: vendemos café de especialidad y pastelería casera todos los días.';
    for (const uid of [301, 302, 303, 304, 305, 306]) {
      insUser.run(uid, `fd-${uid}@test.invalid`, bcrypt.hashSync('fd-pass-' + uid, 10));
      insSet.run(uid, TZ);
      insProf.run(uid, 'Negocio FD ' + uid, DESC);
      insSess.run('fd-' + uid, sessJson(uid), exp);
    }
    const insPost = db0.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, week_key, needs_review) VALUES (?, ?, '/media/fixture.jpg', ?, '', ?, ?, ?, ?, ?)`);
    const CAP = 'El café de la casa, recién hecho, como todos los días de esta semana.';
    // F1: posteo de HOY agendado (9101) + borrador fresco de hoy (9102,
    // el candidato que el ensure rescataría de reemplazo).
    insPost.run(9101, 301, CAP, atHour(TODAY, 21), 'scheduled', 'image', mondayOf(TODAY), 0);
    insPost.run(9102, 301, CAP, null, 'draft', 'image', mondayOf(TODAY), 0);
    // F2: posteo del DIA_F2 agendado (9103) + otro borrador (9104, con
    // caption distinto: si compartieran caption, el chequeo de
    // duplicados de v1065 frenaría al segundo y la batería mediría
    // otro lote).
    insPost.run(9103, 302, CAP, atHour(DIA_F2, 19), 'scheduled', 'image', mondayOf(DIA_F2), 0);
    insPost.run(9104, 302, 'Las medialunas de la tarde, recién salidas del horno, como cada día.', null, 'draft', 'image', mondayOf(DIA_F2), 0);
    // F3: posteo de HOY agendado (9105) + el material que sube el dueño.
    insPost.run(9105, 303, CAP, atHour(TODAY, 21), 'scheduled', 'image', mondayOf(TODAY), 0);
    db0.prepare(`INSERT INTO assets (id, user_id, file_path, kind) VALUES (9201, 303, '/media/fixture.jpg', 'photo')`).run();
    // F4: posteo de HOY agendado (9106) para la pausa del dueño.
    insPost.run(9106, 304, CAP, atHour(TODAY, 21), 'scheduled', 'image', mondayOf(TODAY), 0);
    // F5: borrador en revisión (9107).
    insPost.run(9107, 305, CAP, null, 'draft', 'image', mondayOf(TODAY), 1);
    // F6: historia de HOY agendada (9108).
    insPost.run(9108, 306, CAP, atHour(TODAY, 21), 'scheduled', 'story', mondayOf(TODAY), 0);
    db0.close();
    const q = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).all(...args); d.close(); return r; };
    const q1 = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).get(...args); d.close(); return r; };
    const dayOfPost = (id) => { const p = q1('SELECT scheduled_at FROM posts WHERE id = ?', id); return p && p.scheduled_at ? dayKeyInTz(new Date(String(p.scheduled_at).replace(' ', 'T')), TZ) : null; };
    const stopRow = (uid, day) => { try { return q1('SELECT * FROM day_stops WHERE user_id = ? AND day_key = ?', uid, day) || null; } catch (e) { return null; } };

    // ================= F1 · replay del incidente 679 =================
    console.log('\n== F1 · freno de soporte sobre HOY → el ensure NO impone reemplazo ==');
    const re1 = await adminPost('/api/admin/support/posts/9101/rehacer', { note: 'video con subtítulos pisados' });
    t('F1.1 el rehacer de soporte responde 200 modo borrador', re1.status === 200 && !!(re1.json && re1.json.ok) && re1.json.modo === 'borrador',
      'status=' + re1.status + ' body=' + JSON.stringify(re1.json).slice(0, 200));
    t('F1.2 la respuesta trae dia_marcado = hoy', !!(re1.json && re1.json.dia_marcado === TODAY),
      'dia_marcado=' + (re1.json && re1.json.dia_marcado));
    const p9101 = q1('SELECT * FROM posts WHERE id = 9101');
    t('F1.3 el frenado queda borrador sin fecha, pendiente (como siempre)',
      p9101.status === 'draft' && !p9101.scheduled_at && p9101.approval === 'pending',
      JSON.stringify({ s: p9101.status, at: p9101.scheduled_at, a: p9101.approval }));
    const st1 = stopRow(301, TODAY);
    t('F1.4 el día quedó frenado: day_stops(301, hoy) origen soporte_rehacer, post 9101',
      !!st1 && st1.origen === 'soporte_rehacer' && Number(st1.post_id) === 9101,
      'row=' + JSON.stringify(st1));
    await api('POST', '/api/week/ensure', 'fd-301', {});
    await sleep(4000);
    const reason1 = await lastReason('fd-301', 8);
    t('F1.5 el ensure reporta dia_frenado_dueno', reason1 === 'dia_frenado_dueno', 'reason=' + reason1);
    const p9102 = q1('SELECT * FROM posts WHERE id = 9102');
    t('F1.6 el borrador fresco NO se programó de reemplazo (sigue borrador)', p9102.status === 'draft' && !p9102.scheduled_at,
      JSON.stringify({ s: p9102.status, at: p9102.scheduled_at }));
    const p9101b = q1('SELECT * FROM posts WHERE id = 9101');
    t('F1.7 el posteo frenado tampoco resucitó como programado', p9101b.status === 'draft' && !p9101b.scheduled_at,
      JSON.stringify({ s: p9101b.status, at: p9101b.scheduled_at }));
    const schedHoy301 = q(`SELECT id FROM posts WHERE user_id = 301 AND status = 'scheduled'`).filter((p) => dayOfPost(p.id) === TODAY);
    t('F1.8 cero agendados para hoy en la cuenta', schedHoy301.length === 0, 'ids=' + schedHoy301.map((p) => p.id).join(','));
    const total301 = q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = 301').n;
    t('F1.9 cero posteos nuevos creados (siguen siendo 2)', total301 === 2, 'n=' + total301);

    // ================= F2 · freno sobre un día futuro =================
    console.log('\n== F2 · freno de soporte sobre un día futuro → su día también queda marcado ==');
    const re2 = await adminPost('/api/admin/support/posts/9103/rehacer', {});
    t('F2.1 la respuesta trae dia_marcado = el día del posteo', !!(re2.json && re2.json.dia_marcado === DIA_F2),
      'dia_marcado=' + (re2.json && re2.json.dia_marcado) + ' esperado=' + DIA_F2);
    const st2 = stopRow(302, DIA_F2);
    t('F2.2 day_stops(302, día) origen soporte_rehacer', !!st2 && st2.origen === 'soporte_rehacer',
      'row=' + JSON.stringify(st2));
    const sa = await api('POST', '/api/posts/schedule-all', 'fd-302', {});
    t('F2.3 el asignador real corre (schedule-all)', sa.status === 200, 'status=' + sa.status + ' body=' + JSON.stringify(sa.json).slice(0, 160));
    const p9104 = q1('SELECT status FROM posts WHERE id = 9104');
    t('F2.4 el otro borrador (9104) sí quedó agendado por el asignador', p9104.status === 'scheduled', 's=' + p9104.status);
    t('F2.5 el 9104 NO cayó en el día frenado', dayOfPost(9104) !== DIA_F2, 'dia=' + dayOfPost(9104));
    const feedDia302 = q(`SELECT id FROM posts WHERE user_id = 302 AND status = 'scheduled' AND media_type IN ('image','carousel')`).filter((p) => dayOfPost(p.id) === DIA_F2);
    t('F2.6 ningún reemplazo quedó agendado para el día frenado', feedDia302.length === 0, 'ids=' + feedDia302.map((p) => p.id).join(','));
    const st2b = stopRow(302, DIA_F2);
    t('F2.7 el stop sobrevive al schedule-all (el asignador no lo consume)', !!st2b && st2b.origen === 'soporte_rehacer',
      'row=' + JSON.stringify(st2b));

    // ================= F3 · arrepentimiento por Subir =================
    console.log('\n== F3 · el dueño sube algo ese día → se postea hoy y la marca se levanta ==');
    const re3 = await adminPost('/api/admin/support/posts/9105/rehacer', {});
    t('F3.1 el freno previo marcó hoy', !!(re3.json && re3.json.dia_marcado === TODAY) && !!stopRow(303, TODAY),
      'dia_marcado=' + (re3.json && re3.json.dia_marcado));
    // cuando='semana' («usarla en la semana»): el escaneo del plan
    // arranca HOY y el primer día libre es el que soporte frenó — el
    // gesto deliberado del dueño cayendo sobre el día marcado. (Con
    // 'posty' el planificador elige el próximo slot desde mañana: es
    // su regla vigente y no es lo que esta batería mide.)
    const sub = await api('POST', '/api/subir/resolver', 'fd-303',
      { asset_id: 9201, cuando: 'semana', caption_modo: 'mio', caption_text: 'La foto de hoy, subida por el dueño.', mejora: 'no' });
    t('F3.2 el Subir del dueño responde posteado', sub.status === 200 && !!(sub.json && sub.json.ok) && sub.json.modo === 'posteado',
      'status=' + sub.status + ' body=' + JSON.stringify(sub.json).slice(0, 220));
    const nuevoId = sub.json && sub.json.post_id;
    const pNuevo = nuevoId ? q1('SELECT * FROM posts WHERE id = ?', nuevoId) : null;
    t('F3.3 lo subido cayó HOY (el día que soporte había frenado)',
      !!pNuevo && dayOfPost(nuevoId) === TODAY,
      'post=' + JSON.stringify(pNuevo && { s: pNuevo.status, at: pNuevo.scheduled_at, dia: dayOfPost(nuevoId) }));
    t('F3.4 la marca del día se levantó con el gesto del dueño', !stopRow(303, TODAY),
      'row=' + JSON.stringify(stopRow(303, TODAY)));

    // ================= F4 · la pausa del dueño, intacta =================
    console.log('\n== F4 · la pausa del dueño sigue creando su stop como hoy ==');
    const patch4 = await api('PATCH', '/api/posts/9106', 'fd-304', { action: 'unschedule' });
    t('F4.1 la pausa responde 200', patch4.status === 200, 'status=' + patch4.status);
    const st4 = stopRow(304, TODAY);
    t('F4.2 day_stops(304, hoy) origen dueno_pausa (sin contaminación del origen nuevo)',
      !!st4 && st4.origen === 'dueno_pausa' && Number(st4.post_id) === 9106,
      'row=' + JSON.stringify(st4));

    // ================= F6 · historia frenada: el día no se marca =================
    console.log('\n== F6 · historia programada frenada por soporte: vuelve a borrador sin marcar el día ==');
    const re6 = await adminPost('/api/admin/support/posts/9108/rehacer', {});
    const p9108 = q1('SELECT * FROM posts WHERE id = 9108');
    t('F6.1 la historia vuelve a borrador sin fecha', re6.status === 200 && p9108.status === 'draft' && !p9108.scheduled_at,
      'status=' + re6.status + ' post=' + JSON.stringify({ s: p9108.status, at: p9108.scheduled_at }));
    t('F6.2 sin dia_marcado y sin stop (las historias no frenan el día del feed)',
      !!(re6.json && !re6.json.dia_marcado) && !stopRow(306, TODAY),
      'body=' + JSON.stringify(re6.json).slice(0, 160) + ' row=' + JSON.stringify(stopRow(306, TODAY)));

    // ================= F5 · la rama de revisión, intacta =================
    console.log('\n== F5 · borrador en revisión: rehacer = regenerar, sin marca de día ==');
    const re5 = await adminPost('/api/admin/support/posts/9107/rehacer', { note: 'no es el producto' });
    t('F5.1 el rehacer responde modo regenerar', re5.status === 200 && !!(re5.json && re5.json.modo === 'regenerar'),
      'status=' + re5.status + ' body=' + JSON.stringify(re5.json).slice(0, 200));
    t('F5.2 sin dia_marcado en la respuesta', !!(re5.json && !re5.json.dia_marcado),
      'body=' + JSON.stringify(re5.json).slice(0, 200));
    const p9107 = q1('SELECT * FROM posts WHERE id = 9107');
    t('F5.3 el borrador en revisión se borró (camino de regeneración de siempre)', !p9107);
    const stops305 = q('SELECT * FROM day_stops WHERE user_id = 305');
    t('F5.4 ningún day_stop se escribió para la cuenta', stops305.length === 0, 'rows=' + JSON.stringify(stops305));
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
