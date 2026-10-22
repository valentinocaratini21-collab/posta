// test-funnel-recert.js — RECERTIFICACIÓN DEL FUNNEL /prueba (2026-10-21, v306).
// Uso: node test-funnel-recert.js   (tarda ~1–2 min: genera una semana REAL)
//
// Qué prueba, de punta a punta, contra un servidor recién levantado con una
// base scratch (mkdtemp): que cada etapa del funnel de /prueba QUEDE
// REGISTRADA con sus datos correctos, y que el panel (GET /api/admin/funnel)
// la cuente. Recorrido de visitante real (sin test_key en la generación):
//   visita → prueba_view · pasos del form → prueba_step (formulario/ig_submit/
//   rubro_answer con el rubro) · generación real → funnel_events.prueba_done
//   (meta = el @) + prueba_complete · click a registrarse → prueba_register ·
//   registro real → users + funnel_events.registered + events.account_created
//   + la semana importada como borradores · eventos logueados (week_generate_
//   done / post_publish / checkout_start) atados al user_id · hito del cliente
//   POST /api/funnel → client_week_accepted · totales del panel admin.
// Las dos etapas que exigen terceros reales (ig_connect con Meta y payment_ok
// con Stripe/MP) no se pueden manejar en vivo sin credenciales: se certifican
// ESTÁTICAMENTE — el test verifica que los emisores y el mapeo del panel
// existan en el código servido; si un refactor los borra, este test falla.
// Antecedente: este test nace del bug v306 — POST /api/auth/register creaba
// la fila del usuario pero moría con un ReferenceError (`const newUserId =
// newUserId`) antes de registrar 'registered'/'account_created', importar la
// semana o abrir la sesión: el funnel perdía TODOS los registros y el
// visitante veía un 500 genérico. La etapa 6 cubre esa regresión.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-funnel-'));
const PORT = 18777;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'recert-admin';
const SID = 'recertsid01';
const IG = 'posty.funnel.test'; // @ interno inexistente, a propósito
const EMAIL = 'funnel-recert@postyhacetodo.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: ADMIN, TRIAL_TEST_KEY: 'recert-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  try {
    // Espera de arranque
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) { await sleep(1000); }
    }
    if (!up) { console.error(bootLog.slice(-2000)); throw new Error('el servidor no levantó'); }
    console.log('— servidor arriba (base scratch), arranca el recorrido —');

    const db = new DatabaseSync(path.join(TMP, 'posta.db'), { readOnly: true });
    const q = (sql, ...p) => db.prepare(sql).all(...p);
    const post = async (url, body, cookie) => {
      const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => ({})), headers: r.headers };
    };
    const track = (events, cookie) => post('/api/track', { events }, cookie);

    // 1) Visita
    for (const p of ['/prueba', '/en/prueba']) {
      const r = await fetch(BASE + p);
      ok(r.status === 200, `GET ${p} → 200`);
    }
    // 2) prueba_view anónimo
    let r = await track([{ name: 'prueba_view', props: {}, sid: SID }]);
    ok(r.status === 200 && r.json.n === 1, 'POST /api/track acepta prueba_view');
    let rows = q(`SELECT user_id, session_id, created_at FROM events WHERE name='prueba_view' AND session_id=?`, SID);
    ok(rows.length === 1 && rows[0].user_id === null && !!rows[0].created_at, 'events.prueba_view registrado (anónimo, con timestamp)');
    // 3) Pasos del formulario
    r = await track([
      { name: 'prueba_step', props: { step: 'formulario' }, sid: SID },
      { name: 'prueba_step', props: { step: 'ig_submit' }, sid: SID },
      { name: 'prueba_step', props: { step: 'rubro_answer', rubro: 'cafeteria', subcat: '' }, sid: SID },
    ]);
    ok(r.status === 200 && r.json.n === 3, 'POST /api/track acepta los prueba_step');
    rows = q(`SELECT props FROM events WHERE name='prueba_step' AND session_id=? ORDER BY id`, SID);
    ok(rows.length === 3 && JSON.parse(rows[2].props).rubro === 'cafeteria', 'events.prueba_step guardan paso y rubro');
    // 4) Generación REAL (ruta stream, la del visitante; sin test_key a propósito)
    const fd = new FormData();
    fd.append('business', 'FUNNEL TEST INTERNO');
    fd.append('ig', IG);
    fd.append('category', 'cafeteria');
    fd.append('country', 'AR');
    fd.append('tone', 'vos');
    fd.append('goal', '');
    fd.append('competitors', '');
    fd.append('goal_key', 'vender');
    fd.append('producto', 'cafe de especialidad (test interno)');
    fd.append('diferencial', 'recertificación de funnel, negocio ficticio');
    const gr = await fetch(BASE + '/api/trial/generate-stream', { method: 'POST', body: fd });
    const gtext = await gr.text();
    ok(gr.status === 200 && /event: done/.test(gtext) && !/event: error/.test(gtext), 'generación real de la semana (stream) completa');
    rows = q(`SELECT user_id, meta, created_at FROM funnel_events WHERE event='prueba_done'`);
    ok(rows.length >= 1 && rows.some((x) => x.meta === IG), 'funnel_events.prueba_done registrado con el @ en meta');
    // 5) complete + click a registrarse (payloads del cliente)
    r = await track([
      { name: 'prueba_complete', props: { cached: false }, sid: SID },
      { name: 'prueba_register', props: {}, sid: SID },
    ]);
    ok(r.status === 200 && r.json.n === 2, 'POST /api/track acepta prueba_complete + prueba_register');
    // 6) Registro real (regresión v306: 200 + sesión + eventos + importación)
    r = await post('/api/auth/register', { email: EMAIL, password: 'Recert!2026', trial_ig: IG });
    const cookie = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    ok(r.status === 200 && r.json.ok === true && !!cookie, 'POST /api/auth/register → 200 con sesión (regresión v306)');
    const u = q(`SELECT id FROM users WHERE email=?`, EMAIL);
    ok(u.length === 1, 'cuenta de test creada');
    const uid = u.length ? u[0].id : -1;
    rows = q(`SELECT event FROM funnel_events WHERE user_id=? AND event='registered'`, uid);
    ok(rows.length === 1, "funnel_events.registered registrado");
    rows = q(`SELECT name FROM events WHERE user_id=? AND name='account_created'`, uid);
    ok(rows.length === 1, "events.account_created registrado");
    rows = q(`SELECT COUNT(*) AS c FROM posts WHERE user_id=?`, uid);
    ok(rows[0].c > 0, `la semana de la prueba quedó importada (${rows[0].c} borradores)`);
    // 7) Eventos del cliente logueado (paridad con los track() de app.js)
    r = await track([
      { name: 'week_generate_done', props: {}, sid: SID },
      { name: 'post_publish', props: {}, sid: SID },
      { name: 'checkout_start', props: {}, sid: SID },
    ], cookie);
    ok(r.status === 200 && r.json.n === 3, 'POST /api/track (logueado) acepta los 3 eventos');
    rows = q(`SELECT name FROM events WHERE user_id=? AND name IN ('week_generate_done','post_publish','checkout_start')`, uid);
    ok(rows.length === 3, 'los eventos logueados quedan atados al user_id');
    // 8) Hito del cliente vía /api/funnel
    r = await post('/api/funnel', { event: 'week_accepted' }, cookie);
    ok(r.status === 200 && r.json.ok === true, 'POST /api/funnel acepta week_accepted');
    rows = q(`SELECT event FROM funnel_events WHERE user_id=? AND event='client_week_accepted'`, uid);
    ok(rows.length === 1, "funnel_events.client_week_accepted registrado");
    // 9) El panel cuenta el recorrido
    // (v322) El panel filtra por la ÉPOCA de lanzamiento por defecto; esta
    // recertificación valida la CAPTURA de eventos, así que lee la era completa.
    const fr = await fetch(`${BASE}/api/admin/funnel?token=${ADMIN}&days=30&era=all`);
    const fj = await fr.json();
    ok(fr.status === 200 && !!fj.totals, 'GET /api/admin/funnel responde');
    for (const k of ['prueba_view', 'prueba_complete', 'prueba_register', 'week_generate_done', 'post_publish']) {
      ok((fj.totals[k] || 0) >= 1, `panel: totals.${k} >= 1 (=${fj.totals[k]})`);
    }
    ok(fj.totals.ig_connect === 0 && fj.totals.payment_ok === 0, 'panel: ig_connect/payment_ok en 0 sin terceros (esperado en local)');
    db.close();
  } finally {
    child.kill('SIGKILL');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }

  // 10) Certificación estática de las etapas con terceros (Meta / Stripe / MP)
  console.log('— certificación estática (emisores que exigen terceros) —');
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const schedSrc = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  ok(/evTrack\([^)]*'ig_connect'/.test(serverSrc), "emisor events: evTrack 'ig_connect' al conectar Instagram");
  ok(/track\([^)]*'ig_connected'/.test(serverSrc), "emisor legacy: track 'ig_connected'");
  ok((serverSrc.match(/evTrack\([^)]*'payment_ok'/g) || []).length >= 2, "emisores events: evTrack 'payment_ok' en los webhooks (MP + Stripe)");
  ok(/track\([^)]*'subscribed'/.test(serverSrc), "emisor legacy: track 'subscribed'");
  ok(serverSrc.includes("ig_connected: 'ig_connect'") && serverSrc.includes("subscribed: 'payment_ok'"), 'LEGACY_FUNNEL_MAP mapea ig_connected y subscribed a los pasos del panel');
  ok(serverSrc.includes("first_published: 'post_publish'") && schedSrc.includes("'first_published'"), "post_publish: scheduler registra 'first_published' y el panel lo mapea");
  ok(appSrc.includes("track('week_generate_done'") && appSrc.includes("track('post_publish'"), 'app.js emite week_generate_done y post_publish');
  for (const k of ['prueba_view', 'prueba_complete', 'prueba_register', 'ig_connect', 'week_generate_done', 'post_publish', 'payment_ok']) {
    ok(serverSrc.includes(`key: '${k}'`), `FUNNEL_STEPS incluye '${k}'`);
  }

  console.log(`\n=== funnel-recert: ${total - fails}/${total} OK ===`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
