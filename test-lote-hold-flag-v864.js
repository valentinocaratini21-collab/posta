'use strict';
// (LOTE HOLD-FLAG · 10/11 · v864 · M185-hold) Flag de hold a nivel usuario:
// una cuenta en hold NUNCA es barrida por el sweep dominical ni avisada con
// «tu semana está lista», aunque su trial siga vigente. El hold se chequea en
// planOrTrialOk / nextWeekEligible / generateWeekDrafts / sendWeekReady, y se
// prende/apaga por POST /api/admin/hold. Sin hold, el comportamiento es el
// actual (trial vencido → no_plan; trial vigente o plan activo → pasa el gate 1).
// Boot real del servidor en proceso (patrón test-lote-estrategia-posteos-v852.js).
const fs = require('fs');
const os = require('os');
const path = require('path');

// Bootstrap: server.js necesita express & co. de ~/workspace/posta/
// node_modules. Si NODE_PATH no lo incluye, re-ejecuto este mismo script
// con NODE_PATH (una sola vez; el flag evita el bucle).
const POSTA_NM = '/home/hatch/workspace/posta/node_modules';
try { require.resolve('express'); } catch (e) {
  if (!process.env.V864_BOOTSTRAPPED) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: POSTA_NM, V864_BOOTSTRAPPED: '1' },
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  throw new Error('express no resuelve ni con NODE_PATH=' + POSTA_NM);
}

const TREE = __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const DBJS = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const NEJS = fs.readFileSync(path.join(TREE, 'notify-email.js'), 'utf8');

const PORT = 34665;
const ADMIN_TOKEN = 'test-hold-v864';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-hold-'));
process.env.DATA_DIR = TMP;
process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.SESSION_SECRET = 'test-hold-v864';
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function t(name, ok, extra) {
  if (ok) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); }
}
function mondayOfInTz(tz, instant) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const TZ = 'America/Argentina/Buenos_Aires'; // default de userTz en el servidor
const NOW = new Date();
const NEXT_MONDAY = shiftYmd(mondayOfInTz(TZ, NOW), 7);
const FAR_MONDAY = shiftYmd(mondayOfInTz(TZ, NOW), 21); // semana sin nada, para el ok:true
const BASE = 'http://127.0.0.1:' + PORT;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function api(method, pathUrl, body) {
  const r = await fetch(BASE + pathUrl, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
function nowSql() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

(async () => {
  const db = require('./db');
  const srv = require('./server');
  const NE = require('./notify-email');
  // Guardas de contra-prueba: en el árbol prístino (sin el lote) los exports
  // nuevos no existen; devolver undefined hace que el test FALLE sin romper
  // la corrida (la contra-prueba exige que fallen los tests del hold y que
  // pasen los de comportamiento preservado).
  const userOnHold = typeof srv.userOnHold === 'function' ? srv.userOnHold.bind(srv) : () => undefined;
  const planOrTrialOk = typeof srv.planOrTrialOk === 'function' ? srv.planOrTrialOk.bind(srv) : () => undefined;
  t('boot: el servidor levanta con el lote', await waitBoot());
  t('boot: userOnHold y planOrTrialOk exportados', typeof srv.userOnHold === 'function' && typeof srv.planOrTrialOk === 'function',
    'userOnHold=' + typeof srv.userOnHold + ' planOrTrialOk=' + typeof srv.planOrTrialOk);

  // ===== Siembra =====
  // TRIAL_DAYS = 3: trial vigente = created_at ahora + trial_ends_at futuro.
  const nowMs = Date.now();
  const created = nowSql();
  function mkUser(id, email, planStatus, trialEndsMs, hold, holdReason) {
    try {
      db.prepare(`INSERT INTO users (id, email, password_hash, created_at, plan_status, trial_ends_at, hold, hold_reason) VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`).run(id, email, created, planStatus, trialEndsMs, hold ? 1 : 0, holdReason || '');
    } catch (e) {
      // Árbol prístino (contra-prueba): sin columna hold, el usuario nace sin hold.
      db.prepare(`INSERT INTO users (id, email, password_hash, created_at, plan_status, trial_ends_at) VALUES (?, ?, 'x', ?, ?, ?)`).run(id, email, created, planStatus, trialEndsMs);
    }
  }
  mkUser(21, 'hold-21@test.invalid', 'trial', nowMs + 7 * 86400000, 0);       // trial vigente, sin hold
  mkUser(22, 'hold-22@test.invalid', 'trial', nowMs - 7 * 86400000, 0);       // trial vencido, sin hold
  mkUser(23, 'hold-23@test.invalid', 'active', 0, 0);                          // plan activo, sin hold
  mkUser(24, 'hold-24@test.invalid', 'active', 0, 1, 'M83: caso congelado');   // plan activo + hold
  mkUser(25, 'hold-25@test.invalid', 'trial', nowMs + 7 * 86400000, 1, 'M83: caso Mili'); // trial vigente + hold (el caso M185)
  mkUser(26, 'hold-26@test.invalid', 'trial', nowMs + 7 * 86400000, 0);       // trial vigente, activo, sin hold
  mkUser(27, 'hold-27@test.invalid', 'trial', nowMs + 7 * 86400000, 0);       // solo para el endpoint A
  // u26 activo: un borrador de la semana que viene (gate 2 y 4 pasan) y con
  // week_key = NEXT_MONDAY para que el sweep lo saltee por already_exists
  // (el ok:true se prueba con FAR_MONDAY, una semana sin nada).
  db.prepare(`INSERT INTO profiles (user_id, business_name, description) VALUES (26, 'Café Hold', 'Cafetería de barrio con latte de la casa y medialunas caseras.')`).run();
  db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, week_key, created_at) VALUES (26, 'x.jpg', 'borrador activo', 'draft', ?, ?)`).run(NEXT_MONDAY, created);

  // ===== A) Endpoint POST /api/admin/hold (sobre u27, que no usan los demás tests) =====
  const aSin = await api('POST', '/api/admin/hold', { user_id: 27, hold: true });
  t('A1: POST sin token → 403', aSin.status === 403, 'status=' + aSin.status);
  const aUid = await api('POST', `/api/admin/hold?token=${ADMIN_TOKEN}`, { hold: true });
  t('A2: sin user_id → 400 falta user_id', aUid.status === 400 && aUid.json && aUid.json.error === 'falta user_id',
    'status=' + aUid.status + ' body=' + JSON.stringify(aUid.json));
  const a404 = await api('POST', `/api/admin/hold?token=${ADMIN_TOKEN}`, { user_id: 999, hold: true });
  t('A3: usuario inexistente → 404', a404.status === 404 && a404.json && a404.json.error === 'usuario no encontrado',
    'status=' + a404.status + ' body=' + JSON.stringify(a404.json));
  const aInv = await api('POST', `/api/admin/hold?token=${ADMIN_TOKEN}`, { user_id: 27, hold: 'quizas' });
  t('A4: hold inválido → 400', aInv.status === 400 && aInv.json && /hold inválido/.test(aInv.json.error || ''),
    'status=' + aInv.status + ' body=' + JSON.stringify(aInv.json));
  const aSet = await api('POST', `/api/admin/hold?token=${ADMIN_TOKEN}`, { user_id: 27, hold: true, reason: 'M83: caso Mili' });
  t('A5: set hold → 200 con hold=1 y reason guardado', aSet.status === 200 && aSet.json && aSet.json.ok === true && aSet.json.hold === 1 && aSet.json.hold_reason === 'M83: caso Mili',
    'status=' + aSet.status + ' body=' + JSON.stringify(aSet.json));
  let a6ok = false;
  try { a6ok = userOnHold(27) === true && db.prepare('SELECT hold, hold_reason FROM users WHERE id = 27').get().hold === 1; } catch (e) { a6ok = false; }
  t('A6: tras el POST, userOnHold(27) es true y la fila guarda el hold', a6ok,
    'userOnHold=' + userOnHold(27));
  const aSet1 = await api('POST', `/api/admin/hold?token=${ADMIN_TOKEN}`, { user_id: 27, hold: 1, reason: 'segundo motivo' });
  t('A7: hold numérico 1 también prende', aSet1.status === 200 && aSet1.json && aSet1.json.hold === 1 && aSet1.json.hold_reason === 'segundo motivo',
    'body=' + JSON.stringify(aSet1.json));
  const aUnset = await api('POST', `/api/admin/hold?token=${ADMIN_TOKEN}`, { user_id: 27, hold: false });
  t('A8: unset hold → 200 con hold=0 y reason limpio', aUnset.status === 200 && aUnset.json && aUnset.json.hold === 0 && aUnset.json.hold_reason === '',
    'body=' + JSON.stringify(aUnset.json));
  t('A9: tras el unset, userOnHold(27) es false', userOnHold(27) === false, 'userOnHold=' + userOnHold(27));

  // ===== B) userOnHold / planOrTrialOk directos =====
  t('B1: userOnHold(24) true (plan activo + hold)', userOnHold(24) === true, 'userOnHold=' + userOnHold(24));
  t('B2: userOnHold(25) true (trial vigente + hold)', userOnHold(25) === true, 'userOnHold=' + userOnHold(25));
  t('B3: userOnHold(21) false (trial vigente, sin hold)', userOnHold(21) === false, 'userOnHold=' + userOnHold(21));
  t('B4: userOnHold(999) false (usuario inexistente, fail-open)', userOnHold(999) === false, 'userOnHold=' + userOnHold(999));
  t('B5: planOrTrialOk(21) true — trial vigente sin hold, como hoy', planOrTrialOk(21) === true, 'planOrTrialOk=' + planOrTrialOk(21));
  t('B6: planOrTrialOk(22) false — trial vencido sin hold, como hoy', planOrTrialOk(22) === false, 'planOrTrialOk=' + planOrTrialOk(22));
  t('B7: planOrTrialOk(23) true — plan activo sin hold, como hoy', planOrTrialOk(23) === true, 'planOrTrialOk=' + planOrTrialOk(23));
  t('B8: planOrTrialOk(24) false — plan activo CON hold (el hold frena el gate)', planOrTrialOk(24) === false, 'planOrTrialOk=' + planOrTrialOk(24));
  t('B9: planOrTrialOk(25) false — trial vigente CON hold (el caso M185)', planOrTrialOk(25) === false, 'planOrTrialOk=' + planOrTrialOk(25));

  // ===== C) nextWeekEligible =====
  const e21 = srv.nextWeekEligible(21, NEXT_MONDAY);
  t('C1: elegible(21) NO es no_plan ni on_hold (trial vigente pasa el gate 1)', e21.reason !== 'no_plan' && e21.reason !== 'on_hold',
    'reason=' + e21.reason);
  const e22 = srv.nextWeekEligible(22, NEXT_MONDAY);
  t('C2: elegible(22) no_plan — trial vencido sin hold, como hoy', e22.ok === false && e22.reason === 'no_plan',
    'reason=' + e22.reason);
  const e23 = srv.nextWeekEligible(23, NEXT_MONDAY);
  t('C3: elegible(23) NO es no_plan (plan activo pasa el gate 1)', e23.reason !== 'no_plan' && e23.reason !== 'on_hold',
    'reason=' + e23.reason);
  const e24 = srv.nextWeekEligible(24, NEXT_MONDAY);
  t('C4: elegible(24) on_hold — plan activo + hold se saltea', e24.ok === false && e24.reason === 'on_hold',
    'reason=' + e24.reason);
  const e25 = srv.nextWeekEligible(25, NEXT_MONDAY);
  t('C5: elegible(25) on_hold — trial vigente + hold se saltea (el caso M185)', e25.ok === false && e25.reason === 'on_hold',
    'reason=' + e25.reason);
  const e26far = srv.nextWeekEligible(26, FAR_MONDAY);
  t('C6: elegible(26, semana lejana) ok:true — sin hold, activo, como hoy', e26far.ok === true,
    'resultado=' + JSON.stringify(e26far));
  const e26next = srv.nextWeekEligible(26, NEXT_MONDAY);
  t('C7: elegible(26, semana que viene) already_exists — el borrador ya ocupa esa semana', e26next.ok === false && e26next.reason === 'already_exists',
    'reason=' + e26next.reason);

  // ===== D) generateWeekDrafts no genera para cuentas en hold =====
  const g25 = await srv.generateWeekDrafts(25, { weekKey: NEXT_MONDAY, tag: 'test-hold', quiet: true });
  t('D1: generateWeekDrafts(25) on_hold, created 0 — trial vigente + hold no genera', g25.ok === false && g25.reason === 'on_hold' && g25.created === 0,
    'resultado=' + JSON.stringify(g25));
  const g24 = await srv.generateWeekDrafts(24, { weekKey: NEXT_MONDAY, tag: 'test-hold', quiet: true });
  t('D2: generateWeekDrafts(24) on_hold — plan activo + hold no genera', g24.ok === false && g24.reason === 'on_hold',
    'resultado=' + JSON.stringify(g24));
  const g22 = await srv.generateWeekDrafts(22, { weekKey: NEXT_MONDAY, tag: 'test-hold', quiet: true });
  t('D3: generateWeekDrafts(22) no_plan — trial vencido sin hold, como hoy', g22.ok === false && g22.reason === 'no_plan',
    'resultado=' + JSON.stringify(g22));
  const posts25 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 25`).get().n;
  const posts24 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 24`).get().n;
  t('D4: cero posteos creados para 24 y 25 tras los intentos', posts25 === 0 && posts24 === 0, 'posts25=' + posts25 + ' posts24=' + posts24);

  // ===== E) sendWeekReady no avisa a cuentas en hold =====
  const w25 = await NE.sendWeekReady(db, 25, 3);
  t('E1: sendWeekReady(25) on_hold — trial vigente + hold no recibe el aviso', w25.ok === false && w25.reason === 'on_hold',
    'resultado=' + JSON.stringify(w25));
  const w24 = await NE.sendWeekReady(db, 24, 3);
  t('E2: sendWeekReady(24) on_hold — plan activo + hold no recibe el aviso', w24.ok === false && w24.reason === 'on_hold',
    'resultado=' + JSON.stringify(w24));
  const w21 = await NE.sendWeekReady(db, 21, 3);
  t('E3: sendWeekReady(21) pasa el gate de hold (frena por email no configurado, no por hold)', w21.ok === false && w21.reason === 'email no configurado',
    'resultado=' + JSON.stringify(w21));

  // ===== F) El sweep dominical saltea a las cuentas en hold =====
  const before24 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 24`).get().n;
  const before25 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 25`).get().n;
  const before26 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 26`).get().n;
  const sw = await srv.nextWeekSweep();
  const after24 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 24`).get().n;
  const after25 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 25`).get().n;
  const after26 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 26`).get().n;
  t('F1: el sweep corre ok', sw.ok === true, 'resultado=' + JSON.stringify(sw));
  t('F2: el sweep no crea posteos para 24 (plan activo + hold)', after24 === before24, 'antes=' + before24 + ' después=' + after24);
  t('F3: el sweep no crea posteos para 25 (trial vigente + hold)', after25 === before25, 'antes=' + before25 + ' después=' + after25);
  t('F4: el sweep no genera nada para 26 (already_exists) ni para el resto', after26 === before26, 'antes=' + before26 + ' después=' + after26);

  // ===== G) Backfill tampoco cubre a las cuentas en hold =====
  const bf = await srv.backfillThisWeek();
  const bf25 = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 25`).get().n;
  t('G1: backfill corre ok y no crea posteos para 25', bf.ok === true && bf25 === after25,
    'resultado=' + JSON.stringify(bf) + ' posts25=' + bf25);

  // ===== H) Boot / BUILD =====
  const ver = await api('GET', '/api/version');
  t('H1: /api/version → 20261105-v864', ver.json && ver.json.build === '20261105-v864',
    'build=' + (ver.json && ver.json.build));
  const idx = await fetch(BASE + '/');
  t('H2: index → 200', idx.status === 200, 'status=' + idx.status);
  t('H3: la tabla users trae las columnas hold y hold_reason (boot las creó)', (() => {
    try {
      const cols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
      return cols.includes('hold') && cols.includes('hold_reason');
    } catch (e) { return false; }
  })(), 'columnas verificadas por PRAGMA');

  // ===== S) Estática: los tres gates + el endpoint + BUILD =====
  t('S1: db.js crea hold y hold_reason en users (ALTER)', DBJS.includes('ALTER TABLE users ADD COLUMN hold INTEGER DEFAULT 0') && DBJS.includes('ALTER TABLE users ADD COLUMN hold_reason TEXT DEFAULT'),
    'ALTERs presentes');
  t('S2: planOrTrialOk chequea el hold (y no toca trialEffectiveEnd)', SRV.includes('if (userOnHold(uid)) return false;') && SRV.includes('trialEffectiveEnd(u) > Date.now()'),
    'gate presente');
  t('S3: nextWeekEligible chequea el hold primero con razón on_hold', SRV.includes("if (userOnHold(uid)) return { ok: false, reason: 'on_hold' };"),
    'chequeo presente');
  t('S4: generateWeekDrafts chequea el hold antes del bypass de fundador', (() => {
    const iH = SRV.indexOf("if (userOnHold(uid)) {");
    const iF = SRV.indexOf('let founderGate = false;');
    return iH > 0 && iF > iH;
  })(), 'orden hold-antes-que-fundador');
  t('S5: sendWeekReady chequea el hold ANTES de emailConfigured', (() => {
    const iH = NEJS.indexOf("if (h && Number(h.hold) === 1) return { ok: false, reason: 'on_hold' };");
    const iE = NEJS.indexOf('if (!emailConfigured())', NEJS.indexOf('async function sendWeekReady'));
    return iH > 0 && iE > iH;
  })(), 'orden hold-antes-que-email');
  t('S6: endpoint POST /api/admin/hold con requireAdminToken', SRV.includes("app.post('/api/admin/hold', requireAdminToken"),
    'endpoint presente');
  t('S7: BUILD v864 ×1 en server.js, cero v851', (SRV.match(/20261105-v864/g) || []).length === 1 && (SRV.match(/20261105-v851/g) || []).length === 0,
    'v864=' + (SRV.match(/20261105-v864/g) || []).length + ' v851=' + (SRV.match(/20261105-v851/g) || []).length);
  t('S8: el hold no toca requireTrialValid (acciones manuales intactas)', (() => {
    const i0 = SRV.indexOf('function requireTrialValid');
    const i1 = SRV.indexOf('trialEffectiveEnd(u) <= Date.now()', i0);
    const blk = i0 >= 0 && i1 > i0 ? SRV.slice(i0, i1) : '';
    return blk && !blk.includes('userOnHold') && !blk.includes('hold');
  })(), 'requireTrialValid sin hold');
  t('S9: la lógica de trial no se tocó (trialEffectiveEnd intacto)', SRV.includes('function trialEffectiveEnd(u)') && SRV.includes('const policyEnd = cMs ? cMs + TRIAL_DAYS * 86400000 : Infinity;'),
    'trialEffectiveEnd presente');
  t('S10: albumRitualSweep saltea cuentas en hold (el push del lunes es un aviso)', (() => {
    const iF = SRV.indexOf('async function albumRitualSweep');
    const iH = SRV.indexOf('if (userOnHold(u.id)) continue;', iF);
    return iF > 0 && iH > iF;
  })(), 'chequeo en albumRitualSweep');

  console.log(`\nHOLD-FLAG-v864: ${pass} ok, ${fail} fallas`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('ERROR:', e && e.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
