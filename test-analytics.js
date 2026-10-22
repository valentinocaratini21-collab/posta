// test-analytics.js — tests de la tanda de analytics de lanzamiento (v322).
// Nivel módulo (sqlite scratch) + smoke HTTP si SMOKE=1 (bootea server.js).
// Uso: node test-analytics.js [--http]
'use strict';
process.env.POSTY_LAUNCH_EPOCH_ISO = new Date(Date.now() - 30 * 864e5).toISOString(); // época = hace 30 días
const fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const LA = require('./launch-analytics');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const sqlAgo = (days, h) => new Date(Date.now() - days * 864e5 - (h || 0) * 36e5).toISOString().slice(0, 19).replace('T', ' ');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'la-test-'));
const db = new DatabaseSync(path.join(dir, 't.db'));
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'trial', plan_status TEXT DEFAULT 'trial',
  lang TEXT DEFAULT 'es', utm_source TEXT DEFAULT '', utm_campaign TEXT DEFAULT '', referred_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')), founder_price REAL, founder_currency TEXT, founder_plan TEXT,
  mp_base_amount INTEGER DEFAULT 0, stripe_subscription_id TEXT DEFAULT '', trial_ends_at INTEGER);
CREATE TABLE profiles (user_id INTEGER, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '');
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE funnel_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, event TEXT, meta TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '',
  status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'pending', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '',
  image_path TEXT DEFAULT '', scheduled_at TEXT, published_at TEXT, created_at TEXT DEFAULT (datetime('now')),
  week_key TEXT DEFAULT '', ig_permalink TEXT DEFAULT '', error TEXT DEFAULT '', strategy_why TEXT DEFAULT '',
  needs_review INTEGER DEFAULT 0, img_redos INTEGER DEFAULT 0, digest_hash TEXT DEFAULT '', user_stopped INTEGER DEFAULT 0,
  source_topic TEXT DEFAULT '', source_angle TEXT DEFAULT '');
CREATE TABLE post_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, client_signal TEXT DEFAULT 'approved',
  auto_signal INTEGER DEFAULT 0, template TEXT DEFAULT '', style_code TEXT DEFAULT '', week_key TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE post_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, caption TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE api_costs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, feature TEXT DEFAULT '', model TEXT DEFAULT '',
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cached_tokens INTEGER DEFAULT 0, images INTEGER DEFAULT 0,
  est_cost_usd REAL DEFAULT 0, ts TEXT DEFAULT (datetime('now')));
CREATE TABLE photo_missions (user_id INTEGER, week_key TEXT DEFAULT '', shots TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE ad_spend (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, campaign TEXT DEFAULT '', amount_usd REAL DEFAULT 0);`);

const insU = db.prepare(`INSERT INTO users (id, email, plan, plan_status, lang, utm_source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insU.run(1, 'viejo@test', 'pro', 'active', 'es', 'email', sqlAgo(60));          // era de prueba
insU.run(2, 'nuevo@test', 'pro', 'active', 'es', 'clinica', sqlAgo(5));        // era de lanzamiento
insU.run(3, 'rojo@test', 'esencial', 'active', 'es', 'dm', sqlAgo(20));        // rojo por calidad
insU.run(4, 'baja@test', 'pro', 'cancelled', 'es', '', sqlAgo(40));            // para autopsia
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)').run(2, 'Clínica Sol', 'clinicasol', 'salud');
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)').run(3, 'Bar Rojo', 'barrojo', 'gastronomia');

const insE = db.prepare('INSERT INTO events (user_id, session_id, name, props, created_at) VALUES (?, ?, ?, ?, ?)');
insE.run(1, '', 'prueba_view', '{}', sqlAgo(60));
insE.run(1, '', 'payment_ok', '{}', sqlAgo(59));
insE.run(2, '', 'prueba_view', JSON.stringify({ src: 'clinica-once', lang: 'es' }), sqlAgo(5));
insE.run(2, '', 'prueba_complete', JSON.stringify({ src: 'clinica-once', lang: 'es' }), sqlAgo(5));
insE.run(2, '', 'payment_ok', JSON.stringify({ src: 'clinica', lang: 'es' }), sqlAgo(0, 20)); // ayer (día ART), para la portada y alertas
insE.run(2, '', 'post_failed', JSON.stringify({ post_id: 50, cause: 'token vencido' }), sqlAgo(0, 3)); // hoy: alerta
insE.run(3, '', 'payment_ok', '{}', sqlAgo(10));
const insC = db.prepare('INSERT INTO api_costs (user_id, feature, est_cost_usd, ts) VALUES (?, ?, ?, ?)');
insC.run(1, 'images', 7.5, sqlAgo(60));   // gasto PRE-época
insC.run(2, 'images', 2.0, sqlAgo(2));
insC.run(3, 'chat', 1.0, sqlAgo(1));

console.log('— 3) origen —');
ok(LA.normalizeSrc('clinica-once') === 'clinica', 'clinica-* → clinica');
ok(LA.normalizeSrc('ig-dm') === 'dm', 'ig-dm → dm');
ok(LA.normalizeSrc('referido') === 'referido', 'referido → referido');
ok(LA.normalizeSrc('') === null && LA.normalizeSrc('flyer') === 'otro', 'vacío → null · desconocido → otro');

console.log('— 1) época: el funnel excluye, el dinero NO —');
const fromLaunch = LA.epochSql(), fromAll = '1970-01-01 00:00:00', nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
const fLaunch = LA.funnelTotals(db, fromLaunch, nowSql);
const fAll = LA.funnelTotals(db, fromAll, nowSql);
const step = (f, k) => f.find(s => s.key === k).users;
ok(step(fLaunch, 'prueba_view') === 1 && step(fAll, 'prueba_view') === 2, 'funnel: la época excluye la vista pre-lanzamiento');
ok(step(fLaunch, 'payment_ok') === 2 && step(fAll, 'payment_ok') === 3, 'funnel: pagos por era correctos');
const money = LA.moneyBoard(db, { priceFor: () => ({ amount: 119, currency: 'USD', usd: 119 }) }, fromLaunch, nowSql);
ok(money.totals.cost_all_time_usd === 10.5, 'ai-costs: el acumulado histórico suma TAMBIÉN lo pre-época (no se resetea)');
ok(money.totals.cost_period_usd === 3, 'ai-costs: el costo del período (desde la época) excluye lo viejo');
const byDim = LA.funnelByDim(db, 'src', fromAll, nowSql);
ok(byDim['clinica'] && byDim['clinica'].prueba_view === 1, 'tablero: funnel por canal (clinica)');
ok(byDim['(sin dato)'] && byDim['(sin dato)'].prueba_view === 1, 'tablero: lo viejo queda "(sin dato)", declarado');

console.log('— 4/5) posteos por cuenta, termómetro y estrategia —');
const insP = db.prepare(`INSERT INTO posts (id, user_id, status, caption, scheduled_at, published_at, created_at, week_key, img_redos, digest_hash, strategy_why)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insP.run(50, 2, 'published', 'Posteo de la clínica', sqlAgo(1), sqlAgo(1), sqlAgo(1), LA.currentWeekKey(), 0, 'abc:ancla', 'porque vende');
insP.run(51, 3, 'draft', 'Posteo rechazado', null, null, sqlAgo(2), LA.currentWeekKey(), 2, 'xyz:sin-ancla', '');
const insS = db.prepare('INSERT INTO post_signals (user_id, post_id, client_signal, updated_at) VALUES (?, ?, ?, ?)');
insS.run(3, 51, 'rejected', sqlAgo(1)); insS.run(3, 51, 'rejected', sqlAgo(1)); insS.run(3, 51, 'rejected', sqlAgo(2));
insS.run(2, 50, 'approved', sqlAgo(1));
const det3 = LA.accountPostsDetail(db, 3);
ok(det3.posts[0].flags.includes('rechazada') && det3.posts[0].flags.includes('regenerada') && det3.posts[0].flags.includes('sin-ancla'), 'detalle: banderas de atención (rechazada/regenerada/sin ancla)');
const h3 = LA.accountHealth(db, db.prepare('SELECT * FROM users WHERE id = 3').get(), {});
ok(h3.level === 'rojo' && h3.cause === 'calidad' && h3.play && h3.play.play === 'revision_reforzada', 'termómetro: rojo por calidad con su jugada');
const ov = LA.accountsOverview(db, {});
ok(ov.accounts[0].user_id === 3, 'overview: la cuenta con atención va primera');
ok(ov.accounts.find(a => a.user_id === 3).health === 'rojo', 'overview: nivel rojo presente');
const open1 = db.prepare("SELECT COUNT(*) AS n FROM health_interventions WHERE status = 'abierta'").get().n;
LA.accountsOverview(db, {});
const open2 = db.prepare("SELECT COUNT(*) AS n FROM health_interventions WHERE status = 'abierta'").get().n;
ok(open1 >= 1 && open1 === open2, 'intervenciones: se registra una y no se duplica');

console.log('— 6) alertas —');
const alerts = LA.computeAlerts(db, {});
ok(alerts.some(a => a.type === 'payment'), 'alerta de pago entrante');
ok(alerts.some(a => a.type === 'post_failed'), 'alerta de publicación fallida');
ok(new Set(alerts.map(a => a.key)).size === alerts.length, 'alertas con clave única (dedup)');

console.log('— 8+A) calidad y taxonomía —');
db.prepare('INSERT INTO post_versions (user_id, post_id, caption) VALUES (3, 51, ?)').run('caption corregido');
const q = LA.qualityMetrics(db, fromAll, nowSql);
ok(q.total === 2 && q.first_pass === 1 && q.first_pass_pct === 50, 'calidad: % a la primera');
ok(q.taxonomy.by_cause.texto === 3, 'taxonomía: señales con versión de caption → texto');
const detTax = LA.classifyRejections(db, fromAll, nowSql);
ok(detTax.improve_first.length >= 1, 'taxonomía: "qué mejorar primero" ordenado');

console.log('— C) rumbo a los 200 / B) autopsia / E) aprendizaje —');
const proj = LA.projection200(db, {}, 'all');
ok(proj.payers === 3 && (proj.status === 'ok' || proj.status === 'sin_datos'), 'proyección: responde con base o se declara sin datos');
ok(proj.status !== 'ok' || typeof proj.basis === 'string', 'proyección: con su base escrita');
LA.sweepAutopsies(db, {});
const pat = LA.autopsyPatterns(db);
ok(pat.n === 1, 'autopsia: la baja quedó capturada con su foto final');
const learn = LA.syncLearning(db);
ok(learn.status === 'sin_datos', 'aprendizaje: fail-closed sin post_metrics');

console.log('— portada de la mañana —');
const m = LA.morning(db, {}, {});
ok(m.attention && m.yesterday && m.today && m.pulse, 'portada: las 4 secciones en orden');
ok(m.yesterday.payments.length === 1 && m.yesterday.payments[0].business_name === 'Clínica Sol', 'portada: el pago de ayer viene con nombre del negocio 🎉');
ok(m.pulse.ai_cost_all_time_usd === 10.5, 'portada: pulso con el acumulado de IA sin resetear');

console.log('— 7) carta del lunes —');
process.env.POSTY_LAUNCH_EPOCH_ISO = '2027-01-01T03:00:00.000Z';
const letterFuture = LA.founderLetter(db, {}, {});
ok(letterFuture.fail_closed === true && /era de prueba/.test(letterFuture.text), 'carta: fail-closed antes del lanzamiento, lo dice');
process.env.POSTY_LAUNCH_EPOCH_ISO = new Date(Date.now() - 30 * 864e5).toISOString();
const letter = LA.founderLetter(db, {}, { regen: '1' });
ok(/decisión de la semana/i.test(letter.text), 'carta: trae LA decisión de la semana');

console.log(`\nRESULTADO MÓDULO: ${pass} ok · ${fail} fallos`);
if (!process.argv.includes('--http')) process.exit(fail ? 1 : 0);

// ---------- smoke HTTP (bootea el server real con DATA_DIR temporal) ----------
(async () => {
  const { spawn } = require('child_process');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'la-smoke-'));
  const port = 18779;
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), ADMIN_TOKEN: 'smoke-admin', TRIAL_TEST_KEY: 'smoke-key', POSTY_LAUNCH_EPOCH_ISO: new Date(Date.now() - 30 * 864e5).toISOString() }, stdio: 'pipe' });
  const base = 'http://127.0.0.1:' + port;
  const waitUp = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {} await new Promise(r => setTimeout(r, 1000)); } return false; };
  let hpass = 0, hfail = 0;
  const hok = (c, l) => { if (c) { hpass++; console.log('  ✓ ' + l); } else { hfail++; console.log('  ✗ FALLO HTTP: ' + l); } };
  try {
    hok(await waitUp(), 'el server bootea');
    const T = '?token=smoke-admin';
    for (const [route, key] of [['morning', 'morning'], ['launch-board', 'board'], ['accounts-posts', 'accounts'], ['alerts', 'alerts'], ['founder-letter', 'letter'], ['learning', 'learning']]) {
      const r = await fetch(`${base}/api/admin/${route}${T}`);
      const j = await r.json().catch(() => ({}));
      hok(r.ok && j.ok && !!j[key], 'GET /api/admin/' + route);
    }
    const f = await (await fetch(`${base}/api/admin/funnel${T}`)).json();
    hok(f.era && f.era.era === 'launch', 'funnel: época por defecto = launch');
    const ac = await (await fetch(`${base}/api/admin/ai-costs${T}`)).json();
    hok(ac.era_filter === false && typeof ac.total_all_time_usd === 'number', 'ai-costs: sin filtro de época, acumulado presente');
    // registro con origen: el canal se normaliza y el evento nace con src
    const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'smoke@test.com', password: 'secreto1', utm: { source: 'clinica-once', campaign: 'apertura' } }) });
    hok(reg.ok, 'registro con utm de clínica');
    const ev = await (await fetch(`${base}/api/admin/events${T}&user_id=1&era=all`)).json().catch(() => ({}));
    const created = (ev.events || []).find(e => e.name === 'account_created');
    hok(!!created && /"src":"clinica"/.test(created.props || ''), 'el evento account_created hereda src=clinica');
  } catch (e) { hfail++; console.log('  ✗ FALLO HTTP excepción: ' + e.message); }
  child.kill('SIGKILL');
  console.log(`\nRESULTADO HTTP: ${hpass} ok · ${hfail} fallos`);
  process.exit(fail + hfail ? 1 : 0);
})();
