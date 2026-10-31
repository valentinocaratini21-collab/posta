#!/usr/bin/env node
// test-carta-aprobar.js — (v426 · ARMA TODO ítem 5) «APROBAR MI SEMANA»
// desde la Carta dominical: link firmado (userId, weekKey) con el par
// signWeekAction/verifyWeekAction de approval.js empaquetado como token
// de ruta; landing pública /aprobar/:token que SOLO muestra en el GET
// (nunca muta: los escáneres pre-cargan links) y aprueba en el POST con
// LA lógica canónica (acceptAllDrafts, la misma de /api/week/:weekKey/
// publish); botón en la página /carta SOLO cuando la semana presentada
// tiene borradores pendientes; idempotencia; alcance mínimo (solo ESA
// semana de ESA cuenta); ES/EN por cuenta. Contra el server real
// booteado en un DATA_DIR descartable.
// Uso: node test-carta-aprobar.js   (modos internos: --seed / --dump)
'use strict';
process.env.APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'test-approval-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TZ = 'America/Argentina/Buenos_Aires';

if (process.argv.includes('--seed') || process.argv.includes('--dump')) {
  const db = require('./db').db || require('./db');
  const streaks = require('./streaks');
  try { require('./analysis-engine').ensureAnalysisTable(db); } catch (e) {}
  const email = process.env.CA_EMAIL;
  const fx = process.env.CA_FIXTURE;
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) { console.error('seed: sin usuario'); process.exit(1); }
  const uid = u.id;
  const curWk = streaks.mondayKeyOf(streaks.tzToday(TZ));
  const nextWk = streaks.shiftDays(curWk, 7);
  const prevWk = streaks.shiftDays(curWk, -7);
  if (process.argv.includes('--dump')) {
    const rows = db.prepare('SELECT caption, status, week_key FROM posts WHERE user_id = ? ORDER BY id ASC').all(uid);
    console.log('DUMP ' + JSON.stringify({ uid, curWk, nextWk, prevWk, rows }));
    process.exit(0);
  }
  const at = (base, hh) => base + 'T' + hh + ':00:00.000Z';
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, carousel_paths, week_key, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const upProf = (ig, biz) => db.prepare(`INSERT INTO profiles (user_id, ig_username, business_name) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET ig_username = excluded.ig_username, business_name = excluded.business_name`).run(uid, ig, biz || '');
  if (fx === 'a') {
    // Cuenta ES: la semana que la Carta presenta (la próxima) trae 3
    // borradores aprobables (uno en revisión: el tap ES la revisión),
    // más señuelos que NO se deben tocar.
    upProf('negocio.a', 'Panadería La Espiga');
    ins.run(uid, '/media/ca-p1.jpg', 'Pan dulce recién horneado', '#panaderia', at(nextWk, '13:00'), 'draft', 'image', '', nextWk, 0);
    ins.run(uid, '/media/ca-reel.mp4', 'Así amasamos cada día', '', null, 'draft', 'video', '', nextWk, 0);
    ins.run(uid, '/media/ca-p3.jpg', 'EN-REVISION-TAMBIEN-SE-APRUEBA', '', at(streaks.shiftDays(nextWk, 2), '15:00'), 'draft', 'image', '', nextWk, 1);
    ins.run(uid, '/media/ca-x.jpg', 'SEMANA-ACTUAL-NO-SE-TOCA', '', at(curWk, '13:00'), 'draft', 'image', '', curWk, 0);
    ins.run(uid, '/media/ca-x.jpg', 'SEMANA-PASADA-QUEDA-BORRADOR', '', at(prevWk, '13:00'), 'draft', 'image', '', prevWk, 0);
    ins.run(uid, '/media/ca-x.jpg', 'CANCELADO-NO-SE-TOCA', '', at(nextWk, '16:00'), 'cancelled', 'image', '', nextWk, 0);
    // La Carta de esta cuenta: análisis del domingo a la noche (domingo
    // 21:30 en su zona = lunes 00:30 UTC), con su letter persistida.
    // Domingo 21:30 en la zona del cliente = lunes 00:30 UTC (la fecha UTC cae en el lunes de la semana presentada; en BA sigue siendo domingo).
    const sundayIso = nextWk + 'T00:30:00.000Z';
    const payload = {
      lang: 'es', created_at: sundayIso,
      letter: {
        greeting: 'Hola, soy Posty.',
        body: [{ t: 'p', text: 'Tu semana rindió muy bien.' }],
        closing: 'El domingo que viene te cuento más.',
      },
    };
    const info = db.prepare('INSERT INTO account_analysis (user_id, kind, payload) VALUES (?, ?, ?)').run(uid, 'cuenta', JSON.stringify(payload));
    console.log('SEED ' + JSON.stringify({ uid, curWk, nextWk, prevWk, analysisId: info.lastInsertRowid }));
  } else if (fx === 'b') {
    // Otra cuenta con borrador en LA MISMA semana: jamás se toca.
    upProf('otro.b', 'Florería El Jazmín');
    ins.run(uid, '/media/ca-b.jpg', 'POSTEO-DE-OTRA-CUENTA', '', at(nextWk, '12:00'), 'draft', 'image', '', nextWk, 0);
    console.log('SEED ' + JSON.stringify({ uid, curWk, nextWk, prevWk }));
  } else if (fx === 'd') {
    // Cuenta EN con su semana aprobable.
    db.prepare("UPDATE users SET lang = 'en' WHERE id = ?").run(uid);
    upProf('biz.d', 'Bakery D');
    ins.run(uid, '/media/ca-d.jpg', 'fresh bread every morning', '', at(nextWk, '12:00'), 'draft', 'image', '', nextWk, 0);
    console.log('SEED ' + JSON.stringify({ uid, curWk, nextWk, prevWk }));
  } else if (fx === 'e') {
    // Cuenta SIN semana aprobable (sin borradores la semana próxima):
    // su Carta no debe mostrar el botón.
    upProf('vacia.e', 'Sin Semana');
    // Domingo 21:30 en la zona del cliente = lunes 00:30 UTC (la fecha UTC cae en el lunes de la semana presentada; en BA sigue siendo domingo).
    const sundayIso = nextWk + 'T00:30:00.000Z';
    const payload = { lang: 'es', created_at: sundayIso, letter: { greeting: 'Hola, soy Posty.', body: [{ t: 'p', text: 'Semana tranquila.' }], closing: 'Nos vemos el domingo.' } };
    const info = db.prepare('INSERT INTO account_analysis (user_id, kind, payload) VALUES (?, ?, ?)').run(uid, 'cuenta', JSON.stringify(payload));
    console.log('SEED ' + JSON.stringify({ uid, curWk, nextWk, prevWk, analysisId: info.lastInsertRowid }));
  } else { console.error('seed: fixture desconocida'); process.exit(1); }
  process.exit(0);
}

let passed = 0, failed = 0;
const ok = (a, b, extra) => {
  const cond = typeof a === 'boolean' ? a : b;
  const name = typeof a === 'boolean' ? b : a;
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};

/* ---------- estáticos ---------- */
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const approvalJs = fs.readFileSync(path.join(__dirname, 'approval.js'), 'utf8');
ok(serverJs.includes("app.get('/aprobar/:token'") && serverJs.includes("app.post('/aprobar/:token'"), 'rutas GET (lectura) y POST (aprobación) de la landing');
ok(approvalJs.includes('signApproveWeekLink') && approvalJs.includes('verifyApproveWeekLink'), 'firmante y verificador del token en approval.js');
ok(approvalJs.includes('signWeekAction(userId, weekKey, expHours)'), 'el token REUSA signWeekAction (no hay un firmante nuevo)');
ok(serverJs.includes('✅ Aprobar mi semana') && serverJs.includes('✅ Approve my week'), 'copys del botón ES + EN');
ok(serverJs.includes('cartaApproveWeekInfo') && serverJs.includes('data.approveUrl ?'), 'la Carta solo muestra el botón con semana aprobable (gate en el builder)');
ok(serverJs.includes("acceptAllDrafts(u.id, items, { includeNeedsReview: true })"), 'el POST ejecuta la aceptación canónica (acceptAllDrafts), no una reimplementación');
ok((serverJs.match(/HEADLINE_INFINITIVES/g) || []).length === 3, 'canario HEADLINE_INFINITIVES intacto (3 menciones)');
ok(serverJs.includes("const BUILD_ID = '20261031-v507'"), 'BUILD_ID v507');

/* ---------- unidad: token ---------- */
const approval = require('./approval.js');
const WK = '2026-10-26';
const tok = approval.signApproveWeekLink(42, WK);
const ver = approval.verifyApproveWeekLink(tok);
ok(ver && ver.userId === 42 && ver.weekKey === WK, 'token válido devuelve (userId, weekKey)');
ok(approval.verifyApproveWeekLink(tok.slice(0, -2) + 'xx') === null, 'token adulterado rechazado');
ok(approval.verifyApproveWeekLink('basura') === null, 'token basura rechazado');
ok(approval.verifyApproveWeekLink('') === null, 'token vacío rechazado');
ok(approval.verifyApproveWeekLink(approval.signApproveWeekLink(42, WK, -1)) === null, 'token vencido rechazado');
const other = approval.verifyApproveWeekLink(approval.signApproveWeekLink(43, WK));
ok(other && other.userId === 43, 'el token ata a SU cuenta (otro userId no verifica como 42)');
const parts = Buffer.from(tok, 'base64url').toString('utf8').split('.');
const ttlH = (Number(parts[3]) - Math.floor(Date.now() / 1000)) / 3600;
ok(ttlH > 71 && ttlH <= 72, 'TTL declarado: 72h', ttlH.toFixed(2));
ok(approval.verifyApproveWeekLink(approval.signWeekShareLink(42, 3)) === null, 'un token de /semana NO sirve en /aprobar (prefijos separados)');
ok(approval.verifyApproveWeekLink(approval.signCartaLink('domingo', '7')) === null, 'un token de /carta NO sirve en /aprobar');
// La firma es la de signWeekAction: el mismo (sig, exp) verifica por la vía FASE 2.
const sw = approval.signWeekAction(42, WK, 72);
ok(approval.verifyWeekAction(42, WK, sw.sig, sw.exp) === true, 'la primitiva de semana sigue intacta');

/* ---------- integración ---------- */
const PORT = 4427;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-carta-aprobar-'));

async function call(method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const txt = await r.text();
  let data = null; try { data = JSON.parse(txt); } catch (e) { data = txt; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, text: txt, cookie: sid };
}
function boot() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', APPROVAL_SECRET: 'test-approval-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    (async () => {
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) return resolve(child); } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('no booteó: ' + log.slice(-400)));
    })();
  });
}
function runSeed(mode, fixture, email) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [__filename, mode], {
      cwd: __dirname, env: { ...process.env, DATA_DIR: dataDir, CA_FIXTURE: fixture || '', CA_EMAIL: email }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out));
  });
}
const parseSeed = (out) => { const m = String(out).match(/SEED (\{.*\})/); return m ? JSON.parse(m[1]) : null; };
const parseDump = (out) => { const m = String(out).match(/DUMP (\{.*\})/); return m ? JSON.parse(m[1]) : null; };
const byCaption = (dump, cap) => (dump ? dump.rows.find((r) => r.caption === cap) : null);

(async () => {
  const child = await boot();
  try {
    const A = 'aprobar-a@x.example', B = 'aprobar-b@x.example', D = 'aprobar-d@x.example', E = 'aprobar-e@x.example';
    await call('POST', '/api/auth/register', { email: A, password: 'secreto1' });
    await call('POST', '/api/auth/register', { email: B, password: 'secreto1' });
    await call('POST', '/api/auth/register', { email: D, password: 'secreto1' });
    await call('POST', '/api/auth/register', { email: E, password: 'secreto1' });
    const seedA = parseSeed(await runSeed('--seed', 'a', A));
    const seedB = parseSeed(await runSeed('--seed', 'b', B));
    const seedD = parseSeed(await runSeed('--seed', 'd', D));
    const seedE = parseSeed(await runSeed('--seed', 'e', E));
    ok('seeds A/B/D/E', !!(seedA && seedB && seedD && seedE), JSON.stringify({ seedA, seedB, seedD, seedE }).slice(0, 160));
    const uidA = seedA.uid, nextWk = seedA.nextWk, prevWk = seedA.prevWk;
    const tokenA = approval.signApproveWeekLink(uidA, nextWk);
    const urlA = '/aprobar/' + tokenA;

    // --- La Carta (web) trae el botón, y SOLO con semana aprobable ---
    const cartaTokA = approval.signCartaLink('domingo', String(seedA.analysisId));
    const cartaA = await call('GET', '/carta/' + cartaTokA);
    ok('la Carta dominical enlaza a /aprobar/ con su botón', cartaA.status === 200 && cartaA.text.includes('/aprobar/') && cartaA.text.includes('✅ Aprobar mi semana'), cartaA.status + ' ' + cartaA.text.slice(0, 120));
    const cartaTokE = approval.signCartaLink('domingo', String(seedE.analysisId));
    const cartaE = await call('GET', '/carta/' + cartaTokE);
    ok('Carta SIN semana aprobable: el botón NO sale (regla de verdad)', cartaE.status === 200 && !cartaE.text.includes('/aprobar/') && !cartaE.text.includes('Aprobar mi semana'), cartaE.status);

    // --- GET de la landing: muestra y NO muta ---
    const get1 = await call('GET', urlA);
    ok('landing sin sesión: 200', get1.status === 200, get1.status);
    ok('muestra el negocio y la semana firmada', get1.text.includes('Panadería La Espiga') && get1.text.includes('Pan dulce recién horneado') && get1.text.includes('Así amasamos cada día') && get1.text.includes('EN-REVISION-TAMBIEN-SE-APRUEBA'), get1.text.slice(0, 160));
    ok('NO muestra posteos de otra semana ni de otra cuenta', !get1.text.includes('SEMANA-ACTUAL-NO-SE-TOCA') && !get1.text.includes('POSTEO-DE-OTRA-CUENTA'));
    ok('un solo botón grande de aprobación (form POST)', (get1.text.match(/<form method="post"/g) || []).length === 1 && get1.text.includes('✅ Aprobar mi semana'));
    const dumpTrasGet = parseDump(await runSeed('--dump', '', A));
    ok('el GET NO mutó nada (todo sigue draft)', !!dumpTrasGet && dumpTrasGet.rows.every((r) => r.status === 'draft' || r.status === 'cancelled'), JSON.stringify(dumpTrasGet && dumpTrasGet.rows).slice(0, 200));
    const get2 = await call('GET', urlA);
    ok('segundo GET: sigue ofreciendo aprobar (nada se aprobó solo)', get2.status === 200 && get2.text.includes('<form method="post"'));

    // --- Tokens malos ---
    const bad = await call('GET', urlA.slice(0, -2) + 'xx');
    ok('token adulterado → 404 amable sin datos', bad.status === 404 && !bad.text.includes('Panadería'), bad.status);
    const garbage = await call('GET', '/aprobar/basura');
    ok('token basura → 404', garbage.status === 404, garbage.status);
    const expired = await call('GET', '/aprobar/' + approval.signApproveWeekLink(uidA, nextWk, -1));
    ok('token vencido → 404', expired.status === 404, expired.status);
    const badPost = await call('POST', '/aprobar/basura', {});
    ok('POST con token basura → 404 y no aprueba', badPost.status === 404, badPost.status);

    // --- POST: aprueba SOLO la semana firmada de ESA cuenta ---
    const post1 = await call('POST', urlA, {});
    ok('POST aprueba: pantalla de éxito ES', post1.status === 200 && post1.text.includes('¡Listo! Tu semana quedó aprobada 🎉') && post1.text.includes('3 posteos quedaron programados'), post1.status + ' ' + post1.text.slice(0, 160));
    const dumpA = parseDump(await runSeed('--dump', '', A));
    ok('los 3 de la semana firmada quedaron scheduled (incl. needs_review y el sin horario)', !!dumpA
      && byCaption(dumpA, 'Pan dulce recién horneado').status === 'scheduled'
      && byCaption(dumpA, 'Así amasamos cada día').status === 'scheduled'
      && byCaption(dumpA, 'EN-REVISION-TAMBIEN-SE-APRUEBA').status === 'scheduled', JSON.stringify(dumpA && dumpA.rows).slice(0, 240));
    ok('la semana actual NO se tocó', byCaption(dumpA, 'SEMANA-ACTUAL-NO-SE-TOCA').status === 'draft');
    ok('la semana pasada NO se tocó', byCaption(dumpA, 'SEMANA-PASADA-QUEDA-BORRADOR').status === 'draft');
    ok('el cancelado NO se tocó', byCaption(dumpA, 'CANCELADO-NO-SE-TOCA').status === 'cancelled');
    const dumpB = parseDump(await runSeed('--dump', '', B));
    ok('la otra cuenta NO se tocó', !!dumpB && byCaption(dumpB, 'POSTEO-DE-OTRA-CUENTA').status === 'draft');

    // --- Idempotencia ---
    const post2 = await call('POST', urlA, {});
    ok('segundo POST: éxito «ya estaba aprobada»', post2.status === 200 && post2.text.includes('Tu semana ya estaba aprobada'), post2.text.slice(0, 140));
    const get3 = await call('GET', urlA);
    ok('GET tras aprobar: estado honesto sin botón', get3.status === 200 && get3.text.includes('Tu semana ya estaba aprobada') && !get3.text.includes('<form method="post"'));
    const cartaA2 = await call('GET', '/carta/' + cartaTokA);
    ok('la Carta ya no ofrece el botón (nada pendiente)', cartaA2.status === 200 && !cartaA2.text.includes('/aprobar/'), cartaA2.status);

    // --- Semana firmada YA PASADA: honestidad, sin botón ni aprobación ---
    const tokenPast = approval.signApproveWeekLink(uidA, prevWk);
    const getPast = await call('GET', '/aprobar/' + tokenPast);
    ok('semana pasada: aviso honesto y SIN form', getPast.status === 200 && getPast.text.includes('Esta semana ya pasó') && !getPast.text.includes('<form method="post"'), getPast.status + ' ' + getPast.text.slice(0, 140));
    const postPast = await call('POST', '/aprobar/' + tokenPast, {});
    const dumpA2 = parseDump(await runSeed('--dump', '', A));
    ok('POST a semana pasada: no aprueba nada', postPast.status === 200 && postPast.text.includes('Esta semana ya pasó') && byCaption(dumpA2, 'SEMANA-PASADA-QUEDA-BORRADOR').status === 'draft');

    // --- Cuenta EN: paridad total ---
    const tokenD = approval.signApproveWeekLink(seedD.uid, seedD.nextWk);
    const getD = await call('GET', '/aprobar/' + tokenD);
    ok('cuenta EN: landing en inglés con su botón', getD.status === 200 && getD.text.includes('<html lang="en"') && getD.text.includes('✅ Approve my week') && getD.text.includes('fresh bread every morning'), getD.status + ' ' + getD.text.slice(0, 140));
    const postD = await call('POST', '/aprobar/' + tokenD, {});
    ok('cuenta EN: éxito en inglés', postD.status === 200 && postD.text.includes('Done! Your week is approved 🎉'), postD.text.slice(0, 140));
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
  }
  console.log(`test-carta-aprobar: ${passed} ok / ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

