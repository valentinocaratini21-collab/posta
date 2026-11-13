// test-lote-exhibicion-prueba.js — LOTE EXHIBICIÓN-PRUEBA-RECIÉN-
// ENTREGADA (forense Parte B de la auditoría de corridas Veja #7 +
// Mejuri, ~/workspace/.diag-veja7/AUDIT.md).
//
// El bug: tras la entrega, trialLockGate chequea findUsed ANTES que el
// candado y devuelve usedForever ante cualquier fila de trial_used —
// corre a la cabeza de ambas rutas de generación — y guest/start
// responde 409 por findConsumedUsed. El formulario no distingue «usada
// por una entrega anterior» de «entregada recién, en este mismo flujo»:
// cualquier re-entrada/reenvío tras generar choca con la fila que el
// propio flujo escribió y muestra «ya usó su única prueba» en vez de la
// semana generada (Veja #7, envíos 15:27/15:28 del 13/11).
//
// El arreglo (solo server.js):
//  1. Rama usedForever de AMBAS rutas de generación (clásica y stream):
//     si hay candado con payload para las mismas claves, se sirve el
//     snapshot como la semana ('done' en stream), igual que
//     /api/trial/week. «Ya usó» queda solo para el consumo SIN snapshot.
//  2. guest/start: si el consumo que frena es del invitado que el
//     propio flujo creó y la sesión es suya, reanuda con éxito
//     idempotente (resumed) sin re-importar; sin sesión dueña o con la
//     identidad resolviendo a otro, el 409 sigue intacto.
//  3. La regla de una sola prueba NO cambia: sin sesión dueña ni
//     snapshot, el freno sigue (fail-closed).
//
// Modo CONTROL (EXHIB_CONTROL=1, contra la base v1014): las aserciones
// del comportamiento nuevo se invierten y reproducen el bug; las de la
// regla intacta valen en ambos modos.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.EXHIB_CONTROL === '1';
const PORT = 35141;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = '/tmp/exhib-suite-' + process.pid;
const ENGINE = require(path.join(ROOT, 'demo')).DEMO_ENGINE_V;

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + extra : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);
const count = (s, sub) => String(s || '').split(sub).length - 1;

// ---------- Parte A: estática ----------
{
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  if (!CONTROL) {
    t('A1 el rescate por candado está en AMBAS rutas de generación (findLock tras usedForever ×2)',
      count(src, 'const lockU = trialLock.findLock(db, gate.igK, gate.domK);') === 2 &&
      count(src, 'const snapU = lockU && trialLockServePayload(lockU);') === 2,
      'findLock=' + count(src, 'const lockU = trialLock.findLock(db, gate.igK, gate.domK);'));
    t('A2 stream sirve el snapshot como done (no como used)',
      has(src, "if (snapU) { send('done', { out: snapU }); return finish(); }"));
    t('A3 clásica sirve el snapshot como la semana (res.json)',
      has(src, 'if (snapU) return res.json(snapU);'));
    t('A4 guest/start: la reanudación exige consumo del invitado resuelto Y sesión suya (ownGuest)',
      has(src, 'const ownGuest = !!(entered && consumed.user_id') &&
      has(src, 'Number(consumed.user_id) === Number(entered.id)') &&
      has(src, 'Number(req.session.userId) === Number(entered.id)'));
    t('A5 el 409 de guest/start quedó DETRÁS de la guarda ownGuest (sin atajo de una línea)',
      !has(src, 'if (consumed) return res.status(409).json({ error: trialUsedMessage(lang), trial_used: true });') &&
      has(src, 'if (!ownGuest) return res.status(409).json({ error: trialUsedMessage(lang), trial_used: true });'));
    t('A6 la reanudación responde resumed sin pasar por importTrialWeek (éxito idempotente)',
      has(src, 'posts: nPostsR, resumed: true') &&
      src.indexOf('posts: nPostsR, resumed: true') < src.indexOf('const nImp = importTrialWeek(g.userId'));
  } else {
    t('A1c CONTROL la base NO tiene el rescate (el bug está presente)',
      count(src, 'const lockU = trialLock.findLock(db, gate.igK, gate.domK);') === 0 &&
      !has(src, 'const ownGuest'));
  }
  // La regla no se toca: recordDelivered/findUsed/findConsumedUsed intactos.
  const tl = fs.readFileSync(path.join(ROOT, 'trial-lock.js'), 'utf8');
  t('A7 trial-lock.js intacto: findUsed sigue devolviendo cualquier fila (la distinción vive en las rutas)',
    has(tl, 'function findUsed(db, igKey, domainKey, emailKey)') &&
    has(tl, 'function findConsumedUsed(db, igKey, domainKey)') &&
    has(tl, 'function recordDelivered(db, { ig, domain, userId })'));
}

// ---------- Utilidades de integración ----------
function imgDataUri() {
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'siembra-nails', 'tira-nails-1.jpg'));
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
function payloadFor(ig, business) {
  const img = imgDataUri();
  const captions = [
    'Esplar sneakers, handcrafted with organic cotton and wild rubber from the Amazon rainforest, made to last for years of daily wear.',
    'Our Esplar line pairs chrome-free leather with a recycled lining: a quiet design that goes with everything you already own.',
    'Small steps, honest materials. The Esplar is stitched by people who sign their work, in sizes for the whole family.',
  ];
  const posts = captions.map((caption, i) => ({
    type: 'image', image: img, caption, hashtags: '#exhib #suite',
    headline: ['Uno', 'Dos', 'Tres'][i % 3], style: 'foto', style_name: 'foto', text_mode: 'text',
  }));
  return {
    ok: true, engine: ENGINE, lang: 'en', business, ig, category: 'sneakers',
    posts,
    design: { posts: posts.map((pp) => ({ headline: pp.headline, style: 'foto', kind: 'foto' })) },
    digest: { business, productos: [{ nombre: 'Esplar' }], servicios: [], ciudad: '' },
    content_lang: 'en',
  };
}
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function seedCache(ig, payload) {
  const db = dbOpen();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function seedLock(ig, domain, payloadStr) {
  const db = dbOpen();
  const now = Date.now();
  db.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ig, domain, 'Exhib Suite', 'en', payloadStr, now, now);
  db.close();
}
function seedUsed(ig, userId) {
  const db = dbOpen();
  db.exec(`CREATE TABLE IF NOT EXISTS trial_used (
    kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER,
    created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))`);
  db.prepare('INSERT OR REPLACE INTO trial_used (kind, value, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run('ig', ig, userId, Date.now());
  db.close();
}
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}
async function guestStart(body, cookie) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const r = await fetch(BASE + '/api/guest/start', { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: cookieOf(r) };
}
async function genStream(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(BASE + '/api/trial/generate-stream', { method: 'POST', body: fd });
  return { status: r.status, text: await r.text() };
}
async function genClassic(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(BASE + '/api/trial/generate', { method: 'POST', body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})), };
}
function guestByIg(ig) {
  const db = dbOpen();
  const u = db.prepare('SELECT id, is_guest FROM users WHERE guest_ig = ?').get(ig);
  db.close();
  return u;
}
function postsOf(uid) {
  const db = dbOpen();
  const r0 = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid);
  db.close();
  return (r0 && r0.n) || 0;
}
function usedRow(ig) {
  const db = dbOpen();
  let row = null;
  try { row = db.prepare("SELECT kind, value, user_id FROM trial_used WHERE kind = 'ig' AND value = ?").get(ig); } catch (e) {}
  db.close();
  return row;
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-exhib', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY: 'test-exhib-suite', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t('C0 server booteó', up, log.slice(-400));
    if (!up) return;

    // --- Sesión ajena (invitado Z, sin identidad): se crea ANTES de que
    // cualquier recordDevice ensucie la IP compartida del sandbox. ---
    const rZ = await guestStart({ lang: 'es', device: 'exhib-dev-z' });
    t('C1 invitado sin identidad creado (sesión ajena para el Caso D)',
      rZ.status === 200 && rZ.body.needs_ig === true, JSON.stringify(rZ.body).slice(0, 160));
    const cookieZ = rZ.cookie;

    // --- Caso A: entrega fresca en el mismo flujo + reenvío (Veja #7) ---
    const payloadA = payloadFor('exhiba', 'Exhib A');
    seedCache('exhiba', payloadA);
    seedLock('exhiba', 'exhiba.com', JSON.stringify(payloadA));
    const rA = await guestStart({ ig: 'exhiba', domain: 'exhiba.com', lang: 'en', device: 'exhib-dev-a' });
    t('C2 guest/start entrega la semana (3 posteos)',
      rA.status === 200 && rA.body.posts === 3, JSON.stringify(rA.body).slice(0, 200));
    const uA = guestByIg('exhiba');
    t('C3 el dueño es invitado', !!(uA && uA.is_guest === 1), JSON.stringify(uA));
    const usedA = usedRow('exhiba');
    t('C4 la entrega registró el uso con user_id del invitado (precondición real del bug)',
      !!(usedA && Number(usedA.user_id) === Number(uA.id)), JSON.stringify(usedA));

    // Reenvío del formulario (stream): la semana se sirve como 'done'.
    const sA = await genStream({ ig: 'exhiba', web: 'exhiba.com', lang: 'en' });
    if (!CONTROL) {
      t('C5 reenvío stream tras entregar: event done con la semana, JAMÁS used',
        has(sA.text, 'event: done') && has(sA.text, 'Exhib A') && !has(sA.text, 'event: used'),
        sA.text.slice(0, 240));
    } else {
      t('C5c CONTROL reenvío stream: event used (el bug de exhibición)',
        has(sA.text, 'event: used') && !has(sA.text, 'event: done'), sA.text.slice(0, 240));
    }
    // Reenvío del formulario (clásica): snapshot 200, no 409.
    const gA = await genClassic({ ig: 'exhiba', web: 'exhiba.com', lang: 'en' });
    if (!CONTROL) {
      t('C6 reenvío clásico tras entregar: 200 con el snapshot (posts=3), no 409',
        gA.status === 200 && (gA.body.posts || []).length === 3 && gA.body.trial_used !== true,
        gA.status + ' ' + JSON.stringify(gA.body).slice(0, 200));
    } else {
      t('C6c CONTROL reenvío clásico: 409 trial_used (el bug de exhibición)',
        gA.status === 409 && gA.body.trial_used === true, gA.status + ' ' + JSON.stringify(gA.body).slice(0, 200));
    }
    // Re-entrada con la sesión del invitado dueño: reanuda sin re-importar.
    const rA2 = await guestStart({ ig: 'exhiba', domain: 'exhiba.com', lang: 'en', device: 'exhib-dev-a' }, rA.cookie);
    if (!CONTROL) {
      t('C7 re-entrada del dueño: 200 resumed, mismo user_id',
        rA2.status === 200 && rA2.body.ok === true && rA2.body.resumed === true && Number(rA2.body.user_id) === Number(uA.id),
        rA2.status + ' ' + JSON.stringify(rA2.body).slice(0, 200));
    } else {
      t('C7c CONTROL re-entrada del dueño: 409 (su propio consumo lo frena)',
        rA2.status === 409 && rA2.body.trial_used === true, rA2.status + ' ' + JSON.stringify(rA2.body).slice(0, 200));
    }
    t('C8 sin duplicados: el invitado sigue con exactamente 3 posteos',
      postsOf(uA.id) === 3, 'posts=' + postsOf(uA.id));

    // --- Caso B: usado SIN snapshot y SIN sesión — la regla, intacta ---
    seedCache('exhibb', payloadFor('exhibb', 'Exhib B'));
    seedUsed('exhibb', 999001);
    const sB = await genStream({ ig: 'exhibb', lang: 'en' });
    t('C9 usado sin snapshot, stream: event used con el mensaje (ambos modos)',
      has(sB.text, 'event: used') && has(sB.text, 'already used its one free trial') && !has(sB.text, 'event: done'),
      sB.text.slice(0, 240));
    const gB = await genClassic({ ig: 'exhibb', lang: 'en' });
    t('C10 usado sin snapshot, clásico: 409 trial_used (ambos modos)',
      gB.status === 409 && gB.body.trial_used === true, gB.status + '');
    const rB = await guestStart({ ig: 'exhibb', lang: 'en', device: 'exhib-dev-b' });
    t('C11 usado sin snapshot, guest/start sin sesión: 409 trial_used (ambos modos)',
      rB.status === 409 && rB.body.trial_used === true, rB.status + ' ' + JSON.stringify(rB.body).slice(0, 160));

    // --- Caso C: candado SIN payload = consumo sin snapshot servible ---
    seedUsed('exhibc', 999002);
    seedLock('exhibc', 'exhibc.com', null);
    const sC = await genStream({ ig: 'exhibc', web: 'exhibc.com', lang: 'en' });
    t('C12 candado sin payload, stream: event used, NO done (ambos modos)',
      has(sC.text, 'event: used') && !has(sC.text, 'event: done'), sC.text.slice(0, 240));
    const gC = await genClassic({ ig: 'exhibc', web: 'exhibc.com', lang: 'en' });
    t('C13 candado sin payload, clásico: 409 trial_used (ambos modos)',
      gC.status === 409 && gC.body.trial_used === true, gC.status + '');

    // --- Caso D: claves/sesiones ajenas no cruzan ---
    const rD1 = await guestStart({ ig: 'exhiba', domain: 'exhiba.com', lang: 'en', device: 'exhib-dev-a' });
    t('C14 claves de A SIN sesión: guest/start 409 (no reanuda a un anónimo, ambos modos)',
      rD1.status === 409 && rD1.body.trial_used === true, rD1.status + ' ' + JSON.stringify(rD1.body).slice(0, 160));
    const rD2 = await guestStart({ ig: 'exhiba', domain: 'exhiba.com', lang: 'en', device: 'exhib-dev-z' }, cookieZ);
    t('C15 claves de A con sesión de OTRO invitado: 409 (la sesión ajena no destraba, ambos modos)',
      rD2.status === 409 && rD2.body.trial_used === true, rD2.status + ' ' + JSON.stringify(rD2.body).slice(0, 160));
    const sD = await genStream({ ig: 'exhibc', web: 'exhibc.com', lang: 'en' });
    t('C16 el snapshot de A no se sirve bajo las claves de C (stream de C sigue used)',
      has(sD.text, 'event: used') && !has(sD.text, 'Exhib A'), sD.text.slice(0, 240));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n== test-lote-exhibicion-prueba: ${pass} ok · ${fail} fallas ${CONTROL ? '(CONTROL base)' : ''} ==`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('suite error:', e); process.exit(1); });
