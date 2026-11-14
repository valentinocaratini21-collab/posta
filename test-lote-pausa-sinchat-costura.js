// test-lote-pausa-sinchat-costura.js — COSTURA PAUSA-DURABLE × SIN-CHAT-REUBICACIÓN
// La tarjeta del día vacío del registrado (lote sin-chat) trae el botón
// «Que Posty lo arme» → POST /api/week/ensure. La pausa durable (lote
// pausa-durable) frena el día con day_stops y el ensure respeta el
// freno con reason 'dia_frenado_dueno'. La costura: el toque del botón
// es un gesto deliberado del dueño SOBRE ese día — el cliente lo marca
// con { armar: 1 } SOLO desde pzHoyArmarHoy, y el handler levanta el
// stop del día (dayStopClear con la misma day_key que lee
// ensureTodayPost) y salta el cooldown anti-loop antes de asegurar.
// Las llamadas sin la marca (la carga automática de Hoy, la push, el
// ritual) NO tocan el stop: sin tocar el botón, el día frenado sigue
// frenado aunque la app se abra mil veces.
// Batería:
//   C0 contrato en la fuente (marca única en el cliente, clear y salto
//      de cooldown en el handler, misma derivación de day_key).
//   C1 comportamiento (boot real): pausa de hoy → ensure automático
//      (sin marca) frena y el stop SIGUE → toque (con marca) dentro de
//      la ventana del cooldown: stop borrado, el borrador se agenda
//      para hoy, el pausado no resucita.
//   C2 la marca sin stop previo es inocua (no escribe stops, el
//      ensure corre como siempre).
// Uso: node test-lote-pausa-sinchat-costura.js (contra el árbol de
// este directorio). En el árbol sin la costura C0 y C1.6–C1.9 fallan:
// el toque no levantaría el stop y el día seguiría frenado.
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
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

const ZONES = ['Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Dubai', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'UTC'];
function hourIn(zone, d) {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(d)) % 24; } catch (e) { return -1; }
}
const NOW = new Date();
const TZ = ZONES.find((z) => { const h = hourIn(z, NOW); return h >= 10 && h <= 16; }) || 'UTC';
const TODAY = dayKeyInTz(NOW, TZ);
const mondayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
};
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

// ================= C0 · contrato en la fuente =================
function parteFuente() {
  console.log('\n== C0 · contrato de la costura en la fuente ==');
  const iFn = APP.indexOf('async function pzHoyArmarHoy(');
  const fnSlice = iFn > 0 ? APP.slice(iFn, iFn + 1400) : '';
  t('C0.1 el botón manda la marca deliberada: pzHoyArmarHoy → ensure con { armar: 1 }',
    fnSlice.includes("api.post('/api/week/ensure', { armar: 1 })"));
  const marcas = APP.split("'/api/week/ensure', { armar: 1 }").length - 1;
  t('C0.2 la llamada al ensure con la marca { armar: 1 } existe UNA sola vez en el cliente (ningún otro llamador la manda)',
    marcas === 1, 'ocurrencias=' + marcas);
  const sinMarca = APP.split("api.post('/api/week/ensure', {})").length - 1;
  t('C0.3 las cargas automáticas de Hoy siguen llamando al ensure SIN marca ({}), >= 3',
    sinMarca >= 3, 'ocurrencias=' + sinMarca);
  const iH = SRV.indexOf("app.post('/api/week/ensure'");
  const hSlice = iH > 0 ? SRV.slice(iH, iH + 6500) : '';
  t('C0.4 el handler deriva el toque de la marca del body (toqueArmar)',
    hSlice.includes('const toqueArmar = !!(req.body && (req.body.armar === 1 || req.body.armar === true));'));
  t('C0.5 con el toque, el handler levanta el stop del día con la day_key del lector',
    hSlice.includes('dayStopClear(uid, morningPostPush.dayKeyInTz(new Date(), tz))'));
  t('C0.6 el cooldown anti-loop se salta SOLO con el toque (!toqueArmar)',
    hSlice.includes('if (!toqueArmar && last && last.weekKey === wk'));
  const iEns = SRV.indexOf('async function ensureTodayPost(');
  t('C0.7 el lector del stop usa la MISMA derivación de día (dayKeyInTz) que el clear',
    iEns > 0 && SRV.slice(iEns, iEns + 300).includes('morningPostPush.dayKeyInTz(now || new Date(), tz)')
    && SRV.slice(iEns, iEns + 3200).includes('if (dayStopGet(uid, hoy))'));
}

// ================= boot del servidor real =================
const PORT = 34631;
const SECRET = 'pausa-sinchat-costura-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pausa-sinchat-costura-'));
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
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lastReason(sid, want, tries) {
  for (let i = 0; i < (tries || 12); i++) {
    const r = await api('GET', '/api/week/last-result', sid);
    const rr = r.json && r.json.result;
    if (r.json && r.json.has && rr && rr.reason) {
      if (!want || rr.reason === want) return rr.reason;
    }
    await sleep(900);
  }
  return null;
}

(async () => {
  parteFuente();
  console.log('\n== boot ==');
  console.log('zona de la batería:', TZ, '| hoy:', TODAY);
  fs.mkdirSync(path.join(tmpDir, 'media'), { recursive: true });
  fs.copyFileSync(FIXTURE_JPG, path.join(tmpDir, 'media', 'fixture.jpg'));
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-costura',
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
    t('boot: el servidor levanta con el compuesto', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }

    const bcrypt = require(path.join(NODE_MODULES, 'bcryptjs'));
    const db0 = openDb();
    const insUser = db0.prepare(`INSERT INTO users (id, email, password_hash, plan_status) VALUES (?, ?, ?, 'active')`);
    const insSet = db0.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`);
    const insProf = db0.prepare(`INSERT INTO profiles (user_id, business_name, description) VALUES (?, ?, ?)`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({ cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' }, userId: uid });
    const insSess = db0.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`);
    const DESC = 'Negocio de prueba de la batería de la costura: vendemos café de especialidad y pastelería casera todos los días.';
    for (const uid of [201, 202]) {
      insUser.run(uid, `cs-${uid}@test.invalid`, bcrypt.hashSync('cs-pass-' + uid, 10));
      insSet.run(uid, TZ);
      insProf.run(uid, 'Negocio CS ' + uid, DESC);
      insSess.run('cs-' + uid, sessJson(uid), exp);
    }
    const insPost = db0.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, media_type, week_key) VALUES (?, ?, '/media/fixture.jpg', ?, '', ?, ?, 'image', ?)`);
    const CAP = 'El café de la casa, recién hecho, como todos los días de esta semana.';
    insPost.run(9101, 201, CAP, atHour(TODAY, 21), 'scheduled', mondayOf(TODAY));
    insPost.run(9102, 201, CAP, null, 'draft', mondayOf(TODAY));
    insPost.run(9201, 202, CAP, null, 'draft', mondayOf(TODAY));
    db0.close();
    const q1 = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).get(...args); d.close(); return r; };
    const q = (sql, ...args) => { const d = openDb(); const r = d.prepare(sql).all(...args); d.close(); return r; };
    const dayOfPost = (id) => { const p = q1('SELECT scheduled_at FROM posts WHERE id = ?', id); return p && p.scheduled_at ? dayKeyInTz(new Date(String(p.scheduled_at).replace(' ', 'T')), TZ) : null; };
    const stopRow = (uid, day) => { try { return q1('SELECT * FROM day_stops WHERE user_id = ? AND day_key = ?', uid, day) || null; } catch (e) { return null; } };

    // ================= C1 · la costura en vivo =================
    console.log('\n== C1 · pausa → ensure automático frena → el toque destaba y arma ==');
    const patch1 = await api('PATCH', '/api/posts/9101', 'cs-201', { action: 'unschedule' });
    t('C1.1 la pausa del posteo de hoy responde 200', patch1.status === 200, 'status=' + patch1.status);
    const st1 = stopRow(201, TODAY);
    t('C1.2 el día quedó frenado (day_stops dueno_pausa)', !!st1 && st1.origen === 'dueno_pausa', 'row=' + JSON.stringify(st1));
    // La carga automática de Hoy (sin la marca): el día SIGUE frenado.
    await api('POST', '/api/week/ensure', 'cs-201', {});
    const reasonAuto = await lastReason('cs-201', 'dia_frenado_dueno', 10);
    t('C1.3 el ensure SIN marca reporta dia_frenado_dueno', reasonAuto === 'dia_frenado_dueno', 'reason=' + reasonAuto);
    t('C1.4 sin tocar el botón, el stop SIGUE escrito', !!stopRow(201, TODAY));
    const p9102a = q1('SELECT * FROM posts WHERE id = 9102');
    t('C1.5 sin tocar el botón, el borrador NO se programó', p9102a.status === 'draft' && !p9102a.scheduled_at,
      JSON.stringify({ s: p9102a.status, at: p9102a.scheduled_at }));
    // El toque (con la marca), DENTRO de la ventana del cooldown del
    // intento automático frenado: destaba y arma en el mismo gesto.
    const toque = await api('POST', '/api/week/ensure', 'cs-201', { armar: 1 });
    t('C1.6 el toque responde ok (dispara el armado)', !!(toque.json && toque.json.ok === true),
      'body=' + JSON.stringify(toque.json).slice(0, 160));
    const reasonToque = await lastReason('cs-201', 'today_ok', 14);
    t('C1.7 tras el toque, el ensure corre y reporta today_ok (no el freno cacheado del cooldown)',
      reasonToque === 'today_ok', 'reason=' + reasonToque);
    t('C1.8 el stop del día se borró con el toque', !stopRow(201, TODAY));
    const p9102b = q1('SELECT * FROM posts WHERE id = 9102');
    t('C1.9 el borrador quedó agendado para hoy (el posteo cae en la grilla)',
      p9102b.status === 'scheduled' && dayOfPost(9102) === TODAY,
      JSON.stringify({ s: p9102b.status, dia: dayOfPost(9102) }));
    const p9101 = q1('SELECT * FROM posts WHERE id = 9101');
    t('C1.10 el posteo pausado NO resucitó (sigue borrador frenado por posteo)',
      p9101.status === 'draft' && Number(p9101.user_stopped) === 1,
      JSON.stringify({ s: p9101.status, us: p9101.user_stopped }));
    const schedHoy201 = q(`SELECT id FROM posts WHERE user_id = 201 AND status = 'scheduled'`).filter((p) => dayOfPost(p.id) === TODAY);
    t('C1.11 exactamente UN agendado para hoy (el armado, sin duplicados)', schedHoy201.length === 1 && Number(schedHoy201[0].id) === 9102,
      'ids=' + schedHoy201.map((p) => p.id).join(','));

    // ================= C2 · la marca sin stop es inocua =================
    console.log('\n== C2 · toque sin freno previo: nada raro, el ensure corre ==');
    const toque2 = await api('POST', '/api/week/ensure', 'cs-202', { armar: 1 });
    t('C2.1 el toque sin stop previo responde ok', !!(toque2.json && toque2.json.ok === true),
      'body=' + JSON.stringify(toque2.json).slice(0, 160));
    const reason2 = await lastReason('cs-202', 'today_ok', 14);
    t('C2.2 el ensure arma el de hoy como siempre (today_ok)', reason2 === 'today_ok', 'reason=' + reason2);
    const p9201 = q1('SELECT * FROM posts WHERE id = 9201');
    t('C2.3 el borrador de la cuenta sin freno quedó agendado para hoy',
      p9201.status === 'scheduled' && dayOfPost(9201) === TODAY,
      JSON.stringify({ s: p9201.status, dia: dayOfPost(9201) }));
    const stops202 = q('SELECT * FROM day_stops WHERE user_id = 202');
    t('C2.4 la marca no escribió ningún day_stop', stops202.length === 0, 'n=' + stops202.length);
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
