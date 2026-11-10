'use strict';
// (LOTE PANEL-TEST · 10/11 · v863 · M184) Los contadores subscribers/MRR y
// las alertas de /api/admin/growth excluyen cuentas de test/internas/
// invitadas — la MISMA lista que usa la clasificación M166 de Rina (6/11:
// 7 registers = 6 test/internos + 1 invitado sin identificador; 0 reales).
// Predicado compartido LA.isTestAccountUser por dominio de email (no ids
// fijos): @postyhacetodo.com, @bambooty.test, @guest.invalid,
// @gestyofficemanager.com. Boot real del servidor en proceso (patrón
// test-lote-estrategia-posteos-v852.js) + computeAlerts directo con fecha
// mockeada a miércoles (la rama week_late solo corre weekday >= 3 y hoy es
// martes).
const fs = require('fs');
const os = require('os');
const path = require('path');

// Bootstrap: server.js necesita express & co. de ~/workspace/posta/
// node_modules. Si NODE_PATH no lo incluye, re-ejecuto este mismo script
// con NODE_PATH (una sola vez; el flag evita el bucle).
const POSTA_NM = '/home/hatch/workspace/posta/node_modules';
try { require.resolve('express'); } catch (e) {
  if (!process.env.V863_BOOTSTRAPPED) {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_PATH: POSTA_NM, V863_BOOTSTRAPPED: '1' },
    });
    process.exit(r.status == null ? 1 : r.status);
  }
  throw new Error('express no resuelve ni con NODE_PATH=' + POSTA_NM);
}

const TREE = __dirname;
const PORT = 34670;
const ADMIN_TOKEN = 'boot-test-token-panel-v863';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-panel-v863-'));
process.env.DATA_DIR = TMP;
process.env.PORT = String(PORT);
process.env.ADMIN_TOKEN = ADMIN_TOKEN;
process.env.SESSION_SECRET = 'panel-v863-secret';
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;

let pass = 0, fail = 0;
function t(name, ok, extra) {
  if (ok) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); }
}
const BASE = 'http://127.0.0.1:' + PORT;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(BASE + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function api(pathUrl) {
  const r = await fetch(BASE + pathUrl);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
// week_key del producto: lunes UTC de la semana en curso (como
// currentWeekKey() en launch-analytics.js).
function currentWeekKey() {
  const d = new Date(); const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}
function shiftDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
const TODAY = new Date().toISOString().slice(0, 10);
const WEEK = currentWeekKey();
// Siembra: espejo de la tabla M166 (79-85) + invitados 86-89 + reales.
// created_at explícito: todo lo viejo tiene 10+ días; solo el test 111 es
// reciente (para la alerta de registros).
const SEED_USERS = [
  // id, email, plan, plan_status, created_at, business_name
  [101, 'alta-p0@postyhacetodo.com', 'total', 'active', '2026-10-24 12:00:00', 'Posty.'],
  [102, 'cafe.aroma@bambooty.test', 'total', 'active', '2026-10-25 12:00:00', 'Café Aroma'],
  [103, 'qa-login-2110@postyhacetodo.com', 'esencial', 'active', '2026-10-21 12:00:00', null],
  [104, 'hola@gestyofficemanager.com', 'pro', 'active', '2026-10-23 12:00:00', null],
  [105, 'guest-bxxfjzvxmw49t3i1@guest.invalid', 'total', 'active', '2026-11-06 01:03:00', 'Café de Prueba Bamboo'],
  [106, 'guest-nuevo123@guest.invalid', 'trial', 'trial', '2026-10-31 12:00:00', null],
  [107, 'cliente-real@cafereal.com', 'total', 'active', '2026-10-21 12:00:00', 'Café Real'],
  [108, 'trial-real@panaderiareal.com', 'trial', 'trial', '2026-10-31 12:00:00', null],
  [109, 'trial-vencido-real@muebleria.com', 'trial', 'trial', '2026-10-01 12:00:00', null],
  [110, 'activo-con-posts@floreria.com', 'total', 'active', '2026-10-26 12:00:00', 'Florería Real'],
  [111, 'qa-nuevo@postyhacetodo.com', 'trial', 'trial', TODAY + ' 06:00:00', null],
];
const TEST_NAMES = ['Posty.', 'Café Aroma', 'Café de Prueba Bamboo', 'alta-p0@', 'cafe.aroma@', 'qa-login', 'gestyofficemanager', 'guest-'];
const hasTestName = (s) => TEST_NAMES.some((n) => String(s || '').includes(n));

(async () => {
  const db = require('./db');
  const srv = require('./server');
  const LA = require('./launch-analytics');
  // Si el árbol no exporta el predicado (contra-prueba en v851), cada
  // test que lo usa se marca como falla en vez de romper la suite con un throw.
  const HAS_PRED = typeof LA.isTestAccountUser === 'function';
  t('H1: boot — el servidor levanta con el lote', await waitBoot());
  const ver = await fetch(BASE + '/api/version');
  const verJ = await ver.json().catch(() => null);
  t('H2: /api/version → build 20261105-v863', ver.ok && verJ && verJ.build === '20261105-v863',
    'build=' + (verJ && verJ.build));
  const idx = await fetch(BASE + '/');
  t('H3: index → 200', idx.status === 200, 'status=' + idx.status);

  // Siembra de usuarios + perfiles.
  for (const [id, email, plan, planStatus, created, biz] of SEED_USERS) {
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, created_at) VALUES (?, ?, 'x', ?, ?, ?)`).run(id, email, plan, planStatus, created);
    if (biz) db.prepare(`INSERT INTO profiles (user_id, business_name) VALUES (?, ?)`).run(id, biz);
  }
  // 110 publica esta semana (no entra en churn ni en week_late).
  db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, published_at, week_key) VALUES (110, 'x.jpg', 'flor de la semana', 'published', ?, ?)`).run(TODAY + ' 10:00:00', WEEK);
  // Pagos de hace 40 días: 2 reales (107, 110) + 1 test (101).
  const old40 = shiftDays(TODAY, -40) + ' 12:00:00';
  for (const uid of [107, 110, 101]) {
    db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (?, 'payment_ok', ?)`).run(uid, old40);
  }

  // ===== A) Predicado: reproduce la tabla M166 exactamente =====
  const M166_TEST = [
    'qa-login-2110@postyhacetodo.com', 'hola@gestyofficemanager.com',
    'alta-p0@postyhacetodo.com', 'semana-e2e@postyhacetodo.com',
    'stripe-e2e@postyhacetodo.com', 'cafe.aroma@bambooty.test',
    'guest-bxxfjzvxmw49t3i1@guest.invalid',
  ];
  const M166_REAL = ['cliente-real@cafereal.com', 'trial-real@panaderiareal.com',
    'mili@ejemplo.com', 'valentino_bamboo@hotmail.com', 'negocio@gmail.com'];
  t('A1: el predicado existe y está exportado', HAS_PRED
    && typeof srv === 'object', 'typeof=' + typeof LA.isTestAccountUser);
  if (!HAS_PRED) {
    ['A2', 'A3', 'A4', 'A5', 'A6'].forEach((n) => t(n + ': predicado no exportado', false, 'contra-prueba: el árbol no trae M184'));
  } else {
  t('A2: los 7 emails M166 son test/interno/invitado',
    M166_TEST.every((e) => LA.isTestAccountUser({ email: e }) === true),
    'fails=' + JSON.stringify(M166_TEST.filter((e) => !LA.isTestAccountUser({ email: e }))));
  t('A3: invitados nuevos (86-89, guest-*.invalid) son test sin tocar código',
    ['guest-dua6gz75mw5k8bs2@guest.invalid', 'guest-3t5nwnlqmw5vybsx@guest.invalid',
     'guest-0lywzyxumw61ldn9@guest.invalid', 'guest-01i82cmmmw61s44e@guest.invalid']
      .every((e) => LA.isTestAccountUser({ email: e }) === true));
  t('A4: cuentas reales NO son test', M166_REAL.every((e) => LA.isTestAccountUser({ email: e }) === false),
    'fails=' + JSON.stringify(M166_REAL.filter((e) => LA.isTestAccountUser({ email: e }))));
  t('A5: sin email no se clasifica como test por código (lo clasifica Rina)',
    LA.isTestAccountUser({ email: '' }) === false && LA.isTestAccountUser({}) === false
    && LA.isTestAccountUser(null) === false && LA.isTestAccountUser(undefined) === false);
  t('A6: mayúsculas y espacios no lo esquivan; acepta string directo',
    LA.isTestAccountUser({ email: '  ALTA-P0@POSTYHACETODO.COM ' }) === true
    && LA.isTestAccountUser('cafe.aroma@bambooty.test') === true
    && LA.isTestAccountUser('cliente-real@cafereal.com') === false);
  }

  // ===== B/C) Contadores en vivo: growth + funnel =====
  const g1 = await api(`/api/admin/growth?token=${ADMIN_TOKEN}`);
  const money = (g1.json && g1.json.growth && g1.json.growth.money) || {};
  t('B1: growth.money.subscribers = 2 (solo los 2 clientes reales: 107 y 110)',
    money.subscribers === 2, 'subscribers=' + money.subscribers);
  t('B2: growth.money.mrr = 799800 (2 planes total de clientes reales)',
    money.mrr === 799800, 'mrr=' + money.mrr);
  const f1 = await api(`/api/admin/funnel?days=30&token=${ADMIN_TOKEN}`);
  const goal = (f1.json && f1.json.goal) || {};
  t('C1: funnel.goal.subscribers = 2 (la pestaña Funnel no muestra el espejismo)',
    goal.subscribers === 2, 'subscribers=' + goal.subscribers);
  t('C2: funnel.goal.mrr = 799800', goal.mrr === 799800, 'mrr=' + goal.mrr);

  // ===== D) Churn en vivo: solo reales =====
  const churn = (g1.json && g1.json.growth && g1.json.growth.churn) || [];
  const churnEmails = churn.map((c) => c.email).sort();
  t('D1: churn trae solo las 3 reales sin publicar (107, 108, 109)',
    JSON.stringify(churnEmails) === JSON.stringify(['cliente-real@cafereal.com', 'trial-real@panaderiareal.com', 'trial-vencido-real@muebleria.com']),
    'churn=' + JSON.stringify(churnEmails));
  t('D2: ningún email de test en la lista de churn',
    HAS_PRED && !churnEmails.some((e) => LA.isTestAccountUser({ email: e })));
  const alerts1 = (g1.json && g1.json.growth && g1.json.growth.alerts) || [];
  const med = alerts1.find((a) => String(a.text || '').includes('sin publicar'));
  t('D3: la alerta med dice 3 cliente(s), no 8',
    !!med && /3 cliente\(s\)/.test(med.text), 'alerts=' + JSON.stringify(alerts1.map((a) => a.text)));

  // ===== E/F) Alertas de registros y pagos (fase 1: sin pagos recientes) =====
  t('E1: alerta high «Sin registros en los últimos 5 días» — el test 111 no la suprime',
    alerts1.some((a) => a.sev === 'high' && String(a.text || '').includes('Sin registros')),
    'alerts=' + JSON.stringify(alerts1.map((a) => a.text)));
  t('F1: alerta «Pagos en caída: 0 vs 2» — el pago test de hace 40 días no cuenta',
    alerts1.some((a) => String(a.text || '').includes('Pagos en caída: 0 vs 2')),
    'alerts=' + JSON.stringify(alerts1.map((a) => a.text)));
  t('F2: payment_ok no cambia de significado (sigue siendo la única verdad de pago)',
    (g1.json && g1.json.growth && g1.json.growth.readiness && typeof g1.json.growth.readiness.trial_paid_pct === 'number'));

  // ===== G) Fase 2: eventos recientes (real + test) =====
  const nowTs = TODAY + ' 11:00:00';
  db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (107, 'payment_ok', ?)`).run(nowTs);
  db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (103, 'payment_ok', ?)`).run(nowTs);
  db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (108, 'payment_failed', ?)`).run(nowTs);
  db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (101, 'payment_failed', ?)`).run(nowTs);
  db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (107, 'post_failed', ?)`).run(nowTs);
  db.prepare(`INSERT INTO events (user_id, name, created_at) VALUES (101, 'post_failed', ?)`).run(nowTs);
  const g2 = await api(`/api/admin/growth?token=${ADMIN_TOKEN}`);
  const alerts2 = (g2.json && g2.json.growth && g2.json.growth.alerts) || [];
  t('G1: con un pago real reciente, la alerta de caída desaparece',
    !alerts2.some((a) => String(a.text || '').includes('Pagos en caída')),
    'alerts=' + JSON.stringify(alerts2.map((a) => a.text)));
  t('G2: ninguna alerta de growth nombra una cuenta de test',
    !alerts2.some((a) => hasTestName(a.text)),
    'alerts=' + JSON.stringify(alerts2.map((a) => a.text)));
  const al = await api(`/api/admin/alerts?token=${ADMIN_TOKEN}`);
  const alertsLive = (al.json && al.json.alerts) || [];
  t('G3: /api/admin/alerts no nombra cuentas de test',
    !alertsLive.some((a) => hasTestName(a.title) || hasTestName(a.detail)),
    'alerts=' + JSON.stringify(alertsLive.map((a) => a.title)));

  // ===== I) computeAlerts directo con miércoles mockeado =====
  // Hoy es martes: la rama week_late (weekday >= 3) no corre en vivo.
  // Se mockea Date al miércoles 2026-11-11 (misma semana, lunes 2026-11-09).
  const RealDate = global.Date;
  const fixed = new RealDate('2026-11-11T12:00:00Z');
  class MockDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed.getTime()])); }
    static now() { return fixed.getTime(); }
  }
  MockDate.UTC = RealDate.UTC; MockDate.parse = RealDate.parse;
  global.Date = MockDate;
  let alertsMock;
  try {
    alertsMock = LA.computeAlerts(db, { costCtx: (u) => ({ planPriceUsd: 199, monthSpendUsd: 50 }) });
  } finally {
    global.Date = RealDate;
  }
  const weekLate = alertsMock.filter((a) => a.type === 'week_late');
  t('I1: week_late dispara para el cliente real sin posteos (Café Real, 107)',
    weekLate.some((a) => String(a.title || '').includes('Café Real')),
    'week_late=' + JSON.stringify(weekLate.map((a) => a.title)));
  t('I2: week_late NO dispara para las cuentas de test (la falsa alarma de la 81)',
    !weekLate.some((a) => hasTestName(a.title)),
    'week_late=' + JSON.stringify(weekLate.map((a) => a.title)));
  t('I3: week_late NO dispara para el real que sí publicó esta semana (110)',
    !weekLate.some((a) => String(a.title || '').includes('Florería Real')),
    'week_late=' + JSON.stringify(weekLate.map((a) => a.title)));
  const payOk = alertsMock.find((a) => a.type === 'payment');
  t('I4: el pago celebrado es 1 (solo el real): el payment_ok del test no se celebra',
    !!payOk && payOk.count === 1 && String(payOk.detail || '').includes('Café Real') && !hasTestName(payOk.detail),
    'payment=' + JSON.stringify(payOk));
  const payFail = alertsMock.filter((a) => a.type === 'payment_failed');
  t('I5: pago fallido solo del real (108): el del test (101) no se llora',
    payFail.length === 1 && String(payFail[0].title || '').includes('trial-real@'),
    'payfail=' + JSON.stringify(payFail.map((a) => a.title)));
  const postFail = alertsMock.filter((a) => a.type === 'post_failed');
  t('I6: posteo fallido solo del real (107): el del test (101) no dispara la jugada',
    postFail.length === 1 && String(postFail[0].title || '').includes('Café Real'),
    'postfail=' + JSON.stringify(postFail.map((a) => a.title)));
  const costAlerts = alertsMock.filter((a) => a.type === 'ai_cost');
  t('I7: costo de IA alto solo para reales activos (107, 110): ningún test',
    costAlerts.length === 2 && !costAlerts.some((a) => hasTestName(a.title))
    && costAlerts.some((a) => String(a.title || '').includes('Café Real'))
    && costAlerts.some((a) => String(a.title || '').includes('Florería Real')),
    'ai_cost=' + JSON.stringify(costAlerts.map((a) => a.title)));

  console.log(`\nPANEL-V863: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e && e.stack ? e.stack : e); process.exit(2); });
