#!/usr/bin/env node
// test-showcase.js — 📣 PRUEBA SOCIAL REAL (v370, showcase.js).
//
// El hueco de la home para la primera historia de un cliente pago. Cubre:
//  A) MÓDULO — las compuertas de verdad:
//     · trial y 'free' (Founder/cortesía/dogfood) NUNCA son elegibles;
//     · paga real sin trabajo publicado o sin 14 días de paga observada →
//       no se pregunta; con todo eso → la pregunta 'showcase' nace UNA
//       vez dentro de Posty pregunta (techo 1/semana intacto);
//     · el «sí» arma el borrador desde los datos REALES (mejor posteo por
//       post_metrics, métrica del publish_ledger, rubro/ciudad del
//       fundamento) y la aprobación guarda el texto LITERAL editado;
//     · público solo con consentimiento y cuenta paga al leer: la baja
//       de la cuenta o la revocación apagan la historia solas;
//     · el «ahora no» consume la pregunta; hay UNA insistencia a los 42
//       días y nunca una tercera (la cuenta queda 'declined');
//     · una respuesta que no sea el «sí» no abre ningún borrador.
//  B) HTTP — la home de hoy NO cambia:
//     · GET / y GET /en/ sin la sección (ni markup ni título);
//     · GET /api/showcase vacío → {cases:[]}; con un caso activo
//       sembrado → el caso con su frase literal, su métrica y su imagen;
//     · el admin solo mira: GET con token lista el caso; POST → 404
//       (no existe camino de alta admin); sin token → 403.
//  Modo --seed: siembra el caso activo de la parte B en $DATA_DIR.
//
// Uso: node test-showcase.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 300) : ''); }
};

// ---------- utilidades de fechas (UTC, como el motor) ----------
function mondayKeyOfYmd(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function ymdDaysAgo(n) {
  const dt = new Date(); dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}
function stampDaysAgo(n) { return ymdDaysAgo(n) + ' 12:00:00'; }
function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

// ---------- siembra compartida (parte A y --seed de la parte B) ----------
function loadTree() {
  return {
    db: require('./db').db || require('./db'),
    showcase: require('./showcase'),
    questions: require('./posty-questions'),
    digest: require('./client-digest'),
    rubroId: require('./rubro-id'),
  };
}
function seedUser(db, email, plan, status, lang) {
  const r = db.prepare(`INSERT INTO users (email, password_hash, plan, plan_status, lang) VALUES (?, 'x', ?, ?, ?)`)
    .run(email, plan, status, lang || 'es');
  const uid = Number(r.lastInsertRowid);
  db.prepare(`INSERT INTO profiles (user_id, business_name, category) VALUES (?, 'Café Aurora', 'gastronomia')`).run(uid);
  return uid;
}
function seedDigest(digest, db, uid) {
  const d = digest.emptyDigest();
  d.business = 'Café Aurora';
  d.ciudad = 'Palermo';
  d.category = 'gastronomia';
  d.rubro_id = { rubro: 'gastronomia', subrubro: '', nivel_duda: 0 };
  digest.saveDigest(db, uid, d);
}
function seedLedger(db, uid, daysAgoList) {
  for (const n of daysAgoList) {
    db.prepare(`INSERT INTO publish_ledger (user_id, post_id, kind, status, detail, created_at) VALUES (?, NULL, '', 'published', '', ?)`).run(uid, stampDaysAgo(n));
  }
}
function seedPost(db, uid, opts) {
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, published_at, media_type, ig_permalink)
    VALUES (?, ?, '', 'published', ?, ?, ?)`)
    .run(uid, opts.image, stampDaysAgo(opts.daysAgo || 1), opts.mediaType || 'post', opts.permalink || '');
  const pid = Number(r.lastInsertRowid);
  if (opts.likes != null) {
    db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved) VALUES (?, 0, ?, ?, ?)`).run(pid, opts.likes, opts.comments || 0, opts.saved || 0);
  }
  return pid;
}
// Una cuenta paga completa y vieja: paga observada hace 16 días, trabajo
// publicado en 3 semanas seguidas, dos posteos (el de métricas altas gana).
function seedPaidVeteran(T, email) {
  const uid = seedUser(T.db, email, 'esencial', 'active', 'es');
  seedDigest(T.digest, T.db, uid);
  seedLedger(T.db, uid, [0, 7, 14]);
  const low = seedPost(T.db, uid, { image: '/media/t/low.jpg', daysAgo: 2, likes: 3 });
  const high = seedPost(T.db, uid, { image: '/media/t/high.jpg', daysAgo: 1, likes: 40, comments: 5, saved: 2, permalink: 'https://instagram.com/p/ABC123/' });
  T.db.prepare(`UPDATE showcase_cases SET first_paid_seen_at = ? WHERE user_id = ?`).run(isoDaysAgo(0), uid); // placeholder, se pisa abajo
  T.showcase.observe(T.db, uid);
  T.db.prepare(`UPDATE showcase_cases SET first_paid_seen_at = ? WHERE user_id = ?`).run(isoDaysAgo(16), uid);
  return { uid, low, high };
}

if (process.argv.includes('--seed')) {
  // Siembra el caso ACTIVO de la parte B en el DATA_DIR del entorno.
  const T = loadTree();
  const { uid, high } = seedPaidVeteran(T, 'duena@cafeaurora.example');
  const wk = mondayKeyOfYmd(new Date().toISOString().slice(0, 10));
  const q = T.questions.ensureWeeklyQuestion(T.db, uid, wk, undefined, { lang: 'es' });
  if (!q || q.kind !== 'showcase') { console.error('seed: no nació la pregunta showcase'); process.exit(1); }
  const r = T.questions.applyAnswer(T.db, uid, q.id, { value: 'si' });
  if (!r.ok) { console.error('seed: applyAnswer falló', r); process.exit(1); }
  const a = T.showcase.approve(T.db, uid, 'Posty me salvó el Instagram: publico todas las semanas sin tocar nada.');
  if (!a.ok) { console.error('seed: approve falló', a); process.exit(1); }
  const c = T.showcase.getCase(T.db, uid);
  if (!c || c.post_id !== high) { console.error('seed: post elegido incorrecto', c && c.post_id, high); process.exit(1); }
  console.log('seed ok: caso activo user', uid, 'post', high);
  process.exit(0);
}

// ================= PARTE A — MÓDULO =================
console.log('— A: compuertas del módulo showcase');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-showcase-a-'));
const T = loadTree();
const db = T.db;
const wkNow = mondayKeyOfYmd(new Date().toISOString().slice(0, 10));

// A1) trial y free jamás elegibles (aunque tengan trabajo y antigüedad)
{
  const trial = seedUser(db, 'trial@x.example', 'esencial', 'trial', 'es');
  seedLedger(db, trial, [0, 7, 14]);
  T.showcase.observe(db, trial);
  ok('A1 trial: candidateFor = null', T.showcase.candidateFor(db, trial) === null);
  ok('A1 trial: sin fila de caso', T.showcase.getCase(db, trial) === null);
  const free = seedUser(db, 'free@x.example', 'free', 'active', 'es');
  seedLedger(db, free, [0, 7, 14]);
  ok('A1 free/Founder: candidateFor = null', T.showcase.candidateFor(db, free) === null);
}
// A2) paga real sin trabajo publicado → no; y sin los 14 días → no
{
  const u = seedUser(db, 'nueva@x.example', 'pro', 'active', 'es');
  ok('A2 sin publicaciones: candidateFor = null', T.showcase.candidateFor(db, u) === null);
  seedLedger(db, u, [0]);
  ok('A2 paga recién observada (día 0): candidateFor = null', T.showcase.candidateFor(db, u) === null);
  const row = T.showcase.getCase(db, u);
  ok('A2 la observación quedó asentada (watching)', !!row && row.state === 'watching' && !!row.first_paid_seen_at);
}
// A3–A8) el flujo completo de una cuenta veterana
{
  const { uid, high } = seedPaidVeteran(T, 'veterana@x.example');
  const cand = T.showcase.candidateFor(db, uid);
  ok('A3 elegible: nace la candidata showcase', !!cand && cand.kind === 'showcase');
  ok('A3 un toque, sin texto libre', !!cand && cand.opciones.length === 1 && cand.opciones[0].value === 'si' && cand.allow_text === false);
  const q = T.questions.ensureWeeklyQuestion(db, uid, wkNow, undefined, { lang: 'es' });
  ok('A4 la pregunta de la semana ES la showcase', !!q && q.kind === 'showcase');
  const q2 = T.questions.ensureWeeklyQuestion(db, uid, wkNow, undefined, { lang: 'es' });
  ok('A4 techo intacto: misma pending, sin duplicar', !!q2 && q2.id === q.id);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM posty_questions WHERE user_id = ?`).get(uid).n;
  ok('A4 una sola fila de pregunta', n === 1, n);

  const bad = T.questions.applyAnswer(db, uid, q.id, { value: 'no' });
  ok('A5 una respuesta que no es el sí no abre nada', bad.ok === false && bad.reason === 'bad_option');
  ok('A5 la pregunta sigue pending', T.questions.currentQuestion(db, uid, wkNow) !== null);

  const yes = T.questions.applyAnswer(db, uid, q.id, { value: 'si' });
  ok('A5 el sí aplica como showcase:draft', yes.ok === true && yes.applied === 'showcase:draft', JSON.stringify(yes));
  const c = T.showcase.getCase(db, uid);
  ok('A5 el caso quedó en draft (todavía NO público)', !!c && c.state === 'draft');
  ok('A5 identidad real: nombre del perfil', c.business_name === 'Café Aurora', c.business_name);
  ok('A5 identidad real: rubro del fundamento', c.rubro_label === T.rubroId.labelFor('gastronomia', '', 'es'), c.rubro_label);
  ok('A5 identidad real: ciudad del fundamento', c.city === 'Palermo', c.city);
  ok('A5 mejor posteo = el de más respuesta real', c.post_id === high, `${c.post_id} vs ${high}`);
  ok('A5 métrica del ledger: racha de 3 semanas', c.metric_type === 'weeks_streak' && c.metric_value === 3, `${c.metric_type}:${c.metric_value}`);
  ok('A5 la métrica declara su fuente', c.metric_source === 'publish_ledger');
  ok('A5 la frase propuesta trae sus datos', /Café Aurora/.test(c.quote_text) && /3 semanas/.test(c.quote_text), c.quote_text);
  ok('A5 sin casos públicos todavía', T.showcase.publicCases(db).length === 0);
  ok('A5 nunca se vuelve a preguntar (draft)', T.showcase.candidateFor(db, uid) === null);

  const ap = T.showcase.approve(db, uid, '  Mi frase   literal, editada por mí. ');
  ok('A6 la aprobación pasa el caso a activo', ap.ok === true);
  const c2 = T.showcase.getCase(db, uid);
  ok('A6 el texto publicado es el literal aprobado', c2.quote_text === 'Mi frase literal, editada por mí.', c2.quote_text);
  ok('A6 consentimiento con timestamp', !!c2.consent_at);
  const pub = T.showcase.publicCases(db);
  ok('A6 publicCases devuelve el caso', pub.length === 1 && pub[0].quote_text === 'Mi frase literal, editada por mí.');
  ok('A6 la etiqueta de la métrica sale en su idioma', pub.length === 1 && pub[0].metric_label === '3 semanas seguidas publicando', pub[0] && pub[0].metric_label);

  db.prepare(`UPDATE users SET plan_status = 'canceled' WHERE id = ?`).run(uid);
  ok('A7 la baja de la cuenta apaga la historia sola', T.showcase.publicCases(db).length === 0);
  db.prepare(`UPDATE users SET plan_status = 'active' WHERE id = ?`).run(uid);
  ok('A7 (control) al volver a activa, el caso reaparece', T.showcase.publicCases(db).length === 1);

  const rv = T.showcase.revoke(db, uid);
  ok('A8 la revocación apaga el caso', rv.changed === 1 && T.showcase.publicCases(db).length === 0);
  ok('A8 revocado: nunca más se pregunta', T.showcase.candidateFor(db, uid) === null);
}
// A9) «ahora no»: una insistencia a los 42 días, jamás una tercera
{
  const { uid } = seedPaidVeteran(T, 'timida@x.example');
  const q1 = T.questions.ensureWeeklyQuestion(db, uid, wkNow, undefined, { lang: 'es' });
  ok('A9 primera pregunta showcase', !!q1 && q1.kind === 'showcase');
  T.questions.dismissQuestion(db, uid, q1.id);
  ok('A9 tras el «ahora no» no se insiste en el acto', T.showcase.candidateFor(db, uid) === null);
  // 43 días después: la pregunta vieja envejece y la semana es otra.
  db.prepare(`UPDATE posty_questions SET created_at = ? WHERE id = ?`).run(stampDaysAgo(43), q1.id);
  const wkLater = mondayKeyOfYmd(ymdDaysAgo(-40)); // lunes de la semana +40 días
  const q2 = T.questions.ensureWeeklyQuestion(db, uid, wkLater, undefined, { lang: 'es' });
  ok('A9 la única insistencia llega (≥42 días)', !!q2 && q2.kind === 'showcase', q2 && q2.kind);
  T.questions.dismissQuestion(db, uid, q2.id);
  db.prepare(`UPDATE posty_questions SET created_at = ? WHERE id = ?`).run(stampDaysAgo(90), q2.id);
  ok('A9 jamás una tercera', T.showcase.candidateFor(db, uid) === null);
  const row = T.showcase.getCase(db, uid);
  ok('A9 la cuenta queda declined para siempre', !!row && row.state === 'declined', row && row.state);
}
// A10) métrica sin racha: total de posteos publicados
{
  const u = seedUser(db, 'semana@x.example', 'total', 'active', 'es');
  seedLedger(db, u, [0, 1, 2]);
  const m = T.showcase.computeMetric(db, u);
  ok('A10 sin racha manda el total publicado', m.type === 'posts_published' && m.value === 3, `${m.type}:${m.value}`);
}
// A11) el admin no tiene pluma: el módulo no exporta ningún alta
ok('A11 el módulo no exporta forma de crear casos a mano',
  typeof T.showcase.createCase === 'undefined' && typeof T.showcase.insertCase === 'undefined' && typeof T.showcase.setActive === 'undefined');

// ================= PARTE C — DOM (navegador real) =================
// La sección no es solo "no está en el HTML": con un navegador de
// verdad, SIN casos el DOM final de ambas homes no la contiene; CON un
// caso activo aparece inyectada en su lugar exacto (tras la semana de
// ejemplo, antes de los planes), con la frase literal del cliente — y
// en la home EN la frase queda en su idioma original.
async function domCheck(BASE2, dataDir) {
  let browser = null, srv = null;
  const boot = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: '4381', DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    (async () => {
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE2 + '/api/version'); if (r.ok) return resolve(child); } catch (e) {}
        await new Promise((r) => setTimeout(r, 400));
      }
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('dom: no booteó ' + log.slice(-200)));
    })();
  });
  // playwright no es dependencia del repo: se resuelve de las tools
  // locales que lo tengan (stores/mobile-audit) con el headless shell
  // de ~/.cache/ms-playwright. Sin módulo → la parte C se declara.
  let chromium = null;
  for (const cand of ['playwright', 'playwright-core',
    '/home/hatch/workspace/posty-stores/tools/node_modules/playwright-core',
    '/home/hatch/workspace/posty-mobile-audit/tools/node_modules/playwright-core']) {
    try { const m = require(cand); if (m && m.chromium) { chromium = m.chromium; break; } } catch (e) {}
  }
  let exePath = null;
  try {
    const cacheDir = path.join(os.homedir(), '.cache', 'ms-playwright');
    const shells = fs.readdirSync(cacheDir).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
    if (shells.length) exePath = path.join(cacheDir, shells[shells.length - 1], 'chrome-headless-shell-linux64', 'chrome-headless-shell');
  } catch (e) {}
  if (!chromium) { ok('C: playwright disponible en el entorno', false, 'sin módulo'); return; }
  const launchOpts = exePath && fs.existsSync(exePath) ? { executablePath: exePath } : {};
  // NOTA (hallazgo preexistente, verificado contra el árbol v368 de
  // producción): ttEnhance() pide /api/tiktok/status en cada render y el
  // wrapper de api rebota a #/login ante cualquier 401 — un visitante
  // sin sesión pierde la landing entera a los ~80 ms, en v368 igual que
  // acá. No es de esta tanda; para verificar EL DOM de la landing se
  // intercepta ese único endpoint con su respuesta "no conectado".
  console.log('  · C: /api/tiktok/status interceptado (rebote a #/login preexistente en v368, ajeno a la tanda)');
  const isolate = async (pg) => {
    await pg.route('**/api/tiktok/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"connected":false}' }));
  };
  try {
    srv = await boot();
    browser = await chromium.launch(launchOpts);
    const page = await browser.newPage();
    await isolate(page);
    await page.goto(BASE2 + '/', { waitUntil: 'networkidle', timeout: 45000 });
    ok('C1 DOM ES sin casos: la sección no existe', await page.locator('#historias-reales').count() === 0);
    await page.goto(BASE2 + '/en/', { waitUntil: 'networkidle', timeout: 45000 });
    ok('C1 DOM EN sin casos: la sección no existe', await page.locator('#real-stories').count() === 0);
    await browser.close(); browser = null;
    srv.kill('SIGKILL'); srv = null;

    // Sembrar el caso activo con el motor real + su foto en /media.
    const seed = spawn(process.execPath, [__filename, '--seed'], {
      cwd: __dirname, env: { ...process.env, DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let sLog = '';
    seed.stdout.on('data', (d) => { sLog += d; });
    seed.stderr.on('data', (d) => { sLog += d; });
    const sCode = await new Promise((r) => seed.on('close', r));
    ok('C2 siembra para DOM', sCode === 0, sLog.slice(-200));
    fs.mkdirSync(path.join(dataDir, 'media', 't'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'public', 'ig-cafe.jpg'), path.join(dataDir, 'media', 't', 'high.jpg'));

    srv = await boot();
    browser = await chromium.launch(launchOpts);
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await isolate(p2);
    await p2.goto(BASE2 + '/', { waitUntil: 'networkidle', timeout: 45000 });
    await p2.waitForSelector('#historias-reales', { timeout: 15000 });
    const sec = p2.locator('#historias-reales');
    const txt = await sec.innerText();
    ok('C3 DOM ES con caso: la sección aparece con el negocio', txt.includes('Café Aurora'), txt.slice(0, 120));
    ok('C3 la frase literal aprobada es la que se ve', txt.includes('Posty me salvó el Instagram: publico todas las semanas sin tocar nada.'));
    ok('C3 el dato real se ve en la tarjeta', txt.includes('3 semanas seguidas publicando'));
    const pos = await p2.evaluate(() => {
      const F = Node.DOCUMENT_POSITION_FOLLOWING;
      const wk = document.querySelector('.lp-week-sec');
      const sc = document.getElementById('historias-reales');
      const pl = document.getElementById('planes');
      return !!(wk.compareDocumentPosition(sc) & F) && !!(sc.compareDocumentPosition(pl) & F);
    });
    ok('C3 posición exacta: tras Semanas reales y antes de Planes', pos === true);
    await sec.scrollIntoViewIfNeeded();
    await p2.waitForTimeout(600);
    await sec.screenshot({ path: path.join(__dirname, '..', 'dom-showcase-es.png') });
    await p2.goto(BASE2 + '/en/', { waitUntil: 'networkidle', timeout: 45000 });
    await p2.waitForSelector('#real-stories', { timeout: 15000 });
    const txtEn = await p2.locator('#real-stories').innerText();
    ok('C4 DOM EN: marco en inglés, frase en su idioma original',
      txtEn.includes('Real stories') && txtEn.includes('Posty me salvó el Instagram'), txtEn.slice(0, 140));
    await p2.locator('#real-stories').scrollIntoViewIfNeeded();
    await p2.waitForTimeout(600);
    await p2.locator('#real-stories').screenshot({ path: path.join(__dirname, '..', 'dom-showcase-en.png') });
  } catch (e) {
    ok('C: sin excepciones', false, e && e.message);
  } finally {
    if (browser) try { await browser.close(); } catch (e) {}
    if (srv) try { srv.kill('SIGKILL'); } catch (e) {}
  }
}

// ================= PARTE B — HTTP =================
console.log('— B: la home de hoy no cambia; el caso sembrado aparece');
const PORT = 4377;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDirB = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-showcase-b-'));
async function call(method, p, body, cookie, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (token) headers['x-admin-token'] = token;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let data = null; const txt = await r.text();
  try { data = JSON.parse(txt); } catch (e) { data = txt; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, text: txt, cookie: sid };
}
function bootB() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDirB, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    (async () => {
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) return resolve({ child, log: () => log }); } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('no booteó: ' + log.slice(-400)));
    })();
  });
}
(async () => {
  let b1 = null, b2 = null;
  try {
    b1 = await bootB();
    ok('B0 el server bootea en v370', true);
    const home = await call('GET', '/');
    ok('B1 home ES servida SIN la sección', home.status === 200 && !home.text.includes('historias-reales') && !home.text.includes('Historias reales'));
    const homeEn = await call('GET', '/en/');
    ok('B1 home EN servida SIN la sección', homeEn.status === 200 && !homeEn.text.includes('id="real-stories"') && !homeEn.text.includes('Real stories'));
    const empty = await call('GET', '/api/showcase');
    ok('B2 /api/showcase sin casos → vacío', empty.status === 200 && empty.data && Array.isArray(empty.data.cases) && empty.data.cases.length === 0, JSON.stringify(empty.data).slice(0, 120));
    const noTok = await call('GET', '/api/admin/showcase-cases');
    ok('B3 admin sin token → 403', noTok.status === 403, noTok.status);
    const reg = await call('POST', '/api/auth/register', { email: 'visita@x.example', password: 'secreto1' });
    const me = await call('GET', '/api/showcase/me', null, reg.cookie);
    ok('B4 /me sin historia → null', me.status === 200 && me.data && me.data.showcase === null, JSON.stringify(me.data).slice(0, 120));
    b1.child.kill('SIGKILL'); b1 = null;

    // Sembrar el caso activo con el motor real (subproceso --seed).
    const seed = spawn(process.execPath, [__filename, '--seed'], {
      cwd: __dirname,
      env: { ...process.env, DATA_DIR: dataDirB },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let seedLog = '';
    seed.stdout.on('data', (d) => { seedLog += d; });
    seed.stderr.on('data', (d) => { seedLog += d; });
    const seedCode = await new Promise((r) => seed.on('close', r));
    ok('B5 la siembra del caso activo corrió', seedCode === 0, seedLog.slice(-200));

    b2 = await bootB();
    const full = await call('GET', '/api/showcase');
    const c0 = full.data && full.data.cases && full.data.cases[0];
    ok('B6 /api/showcase devuelve el caso activo', full.status === 200 && !!c0, JSON.stringify(full.data).slice(0, 200));
    ok('B6 la frase es la literal aprobada en la siembra', !!c0 && c0.quote === 'Posty me salvó el Instagram: publico todas las semanas sin tocar nada.', c0 && c0.quote);
    ok('B6 el dato real viaja con su etiqueta', !!c0 && c0.metric_label === '3 semanas seguidas publicando', c0 && c0.metric_label);
    ok('B6 la imagen del posteo elegido viaja', !!c0 && c0.image === '/media/t/high.jpg', c0 && c0.image);
    ok('B6 el permalink del posteo viaja', !!c0 && c0.permalink === 'https://instagram.com/p/ABC123/', c0 && c0.permalink);
    const home2 = await call('GET', '/');
    ok('B7 ni con caso activo la home servida trae la sección (se inyecta en el cliente)', !home2.text.includes('historias-reales'));
    const adm = await call('GET', '/api/admin/showcase-cases?token=test-admin');
    ok('B8 el admin LEE el caso (solo lectura)', adm.status === 200 && adm.data && adm.data.count === 1 && adm.data.rows[0].state === 'active', JSON.stringify(adm.data).slice(0, 160));
    const admPost = await call('POST', '/api/admin/showcase-cases?token=test-admin', { state: 'active' });
    ok('B8 no existe POST admin de casos → 404', admPost.status === 404, admPost.status);
    const lpEn = await call('GET', '/showcase-lp.js?v=1');
    ok('B9 el inyector EN vive fuera del HTML (la home servida no contiene la sección)', lpEn.status === 200 && lpEn.text.includes('/api/showcase') && lpEn.text.includes('Real stories'));
    const bundle = await call('GET', '/app.js?v=248');
    ok('B9 el bundle trae el inyector de la landing', bundle.status === 200 && bundle.text.includes('lpShowcaseInit') && bundle.text.includes('/api/showcase'));
    ok('B9 el bundle trae la tarjeta de la historia', bundle.text.includes('enhanceShowcase') && bundle.text.includes('id="hs-showcase"'));
    const css = await call('GET', '/styles.css?v=20261024d');
    ok('B9 los estilos de la sección están servidos', css.status === 200 && css.text.includes('.sc-card-lp') && css.text.includes('.sc-phone'));
  } catch (e) {
    ok('B: sin excepciones', false, e && e.message);
  } finally {
    if (b1) try { b1.child.kill('SIGKILL'); } catch (e) {}
    if (b2) try { b2.child.kill('SIGKILL'); } catch (e) {}
  }
  console.log('— C: DOM con navegador real');
  await domCheck('http://127.0.0.1:4381', fs.mkdtempSync(path.join(os.tmpdir(), 'posta-showcase-c-')));
  console.log(`\nshowcase: ${passed} ok, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})();
