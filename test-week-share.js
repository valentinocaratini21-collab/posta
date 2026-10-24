#!/usr/bin/env node
// test-week-share.js — (v398) COMPARTIR MI SEMANA: link público firmado
// de SOLO LECTURA. Token HMAC (userId+gen), página viva de la semana de
// ESA cuenta y solo esa, revocación/regeneración que matan el link
// anterior al instante, cero acciones ni datos privados en la página,
// estado vacío honesto e idioma por cuenta. Contra el server real
// booteado en un DATA_DIR descartable.
// Uso: node test-week-share.js   (modos internos: --seed)
'use strict';
process.env.APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'test-approval-secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

if (process.argv.includes('--seed')) {
  const db = require('./db').db || require('./db');
  const streaks = require('./streaks');
  const email = process.env.WS_EMAIL;
  const fx = process.env.WS_FIXTURE;
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!u) { console.error('seed: sin usuario'); process.exit(1); }
  const uid = u.id;
  const wk = streaks.mondayKeyOf(streaks.tzToday('America/Argentina/Buenos_Aires'));
  const prevWk = streaks.shiftDays(wk, -7);
  const at = (base, hh) => base + 'T' + hh + ':00:00.000Z';
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, carousel_paths, week_key, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const upProf = (ig, biz) => db.prepare(`INSERT INTO profiles (user_id, ig_username, business_name) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET ig_username = excluded.ig_username, business_name = excluded.business_name`).run(uid, ig, biz || '');
  if (fx === 'a') {
    upProf('negocio.a', 'Panadería La Espiga');
    ins.run(uid, '/media/ws-p1.jpg', 'todo en minúscula, tal cual lo escribí', '#panaderia #barrio', at(wk, '10:00'), 'scheduled', 'image', '', wk, 0);
    ins.run(uid, '/media/ws-reel.mp4', 'Así amasamos cada día', '', at(streaks.shiftDays(wk, 1), '11:00'), 'draft', 'video', '', wk, 0);
    ins.run(uid, '/media/ws-c1.jpg', 'La semana en fotos', '', at(streaks.shiftDays(wk, 2), '12:00'), 'scheduled', 'carousel', JSON.stringify(['/media/ws-c1.jpg', '/media/ws-c2.jpg']), wk, 0);
    ins.run(uid, '/media/ws-x.jpg', 'CANCELADO-NO-DEBE-VERSE', '', at(wk, '13:00'), 'cancelled', 'image', '', wk, 0);
    ins.run(uid, '/media/ws-x.jpg', 'EN-REVISION-NO-DEBE-VERSE', '', at(wk, '14:00'), 'draft', 'image', '', wk, 1);
    ins.run(uid, '/media/ws-x.jpg', 'SEMANA-PASADA-NO-DEBE-VERSE', '', at(prevWk, '10:00'), 'published', 'image', '', prevWk, 0);
    console.log('seed a ok', uid);
  } else if (fx === 'a2') {
    ins.run(uid, '/media/ws-p7.jpg', 'POSTEO-NUEVO-EN-VIVO', '', at(streaks.shiftDays(wk, 3), '09:00'), 'scheduled', 'image', '', wk, 0);
    console.log('seed a2 ok', uid);
  } else if (fx === 'b') {
    upProf('otro.b', '');
    ins.run(uid, '/media/ws-b.jpg', 'POSTEO-DE-OTRA-CUENTA', '', at(wk, '10:30'), 'scheduled', 'image', '', wk, 0);
    console.log('seed b ok', uid);
  } else if (fx === 'd') {
    db.prepare("UPDATE users SET lang = 'en' WHERE id = ?").run(uid);
    upProf('biz.d', '');
    ins.run(uid, '/media/ws-d.jpg', 'fresh bread every morning', '', at(wk, '09:00'), 'scheduled', 'image', '', wk, 0);
    console.log('seed d ok', uid);
  } else { console.error('seed: fixture desconocida'); process.exit(1); }
  process.exit(0);
}

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};

/* ---------- estáticos ---------- */
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const approvalJs = fs.readFileSync(path.join(__dirname, 'approval.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const chunkAj = fs.readFileSync(path.join(__dirname, 'public/chunk-ajustes.js'), 'utf8');
ok(serverJs.includes("app.get('/semana/:token'"), 'ruta pública de la página de la semana');
ok(serverJs.includes("app.get('/api/week-share'") && serverJs.includes("'/api/week-share/enable'") && serverJs.includes("'/api/week-share/regenerate'") && serverJs.includes("'/api/week-share/revoke'"), 'rutas de estado/alta/regeneración/revocación con sesión');
ok(approvalJs.includes('signWeekShareLink') && approvalJs.includes('verifyWeekShareLink'), 'firma y verificación en approval.js');
ok(dbJs.includes('week_share_gen') && dbJs.includes('week_share_on'), 'columnas de generación e interruptor en users');
ok(chunkAj.includes('Compartir mi semana') && chunkAj.includes('Share my week') && chunkAj.includes('weekShareLoad'), 'sección en Ajustes ES + EN con su cargador');

/* ---------- unidad: token ---------- */
const approval = require('./approval.js');
const tok = approval.signWeekShareLink(42, 3);
const ver = approval.verifyWeekShareLink(tok);
ok(ver && ver.userId === 42 && ver.gen === 3, 'token válido devuelve (userId, gen)');
ok(approval.verifyWeekShareLink(tok.slice(0, -2) + 'xx') === null, 'token adulterado rechazado');
ok(approval.verifyWeekShareLink('basura') === null, 'token basura rechazado');
ok(approval.verifyWeekShareLink('') === null, 'token vacío rechazado');
ok(approval.verifyWeekShareLink(approval.signWeekShareLink(42, 3, -1)) === null, 'token vencido rechazado');
const other = approval.verifyWeekShareLink(approval.signWeekShareLink(43, 3));
ok(other && other.userId === 43, 'el token ata a SU cuenta (otro userId no verifica como 42)');

/* ---------- integración ---------- */
const PORT = 4423;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-weekshare-'));

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
function runSeed(fixture, email) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [__filename, '--seed'], {
      cwd: __dirname, env: { ...process.env, DATA_DIR: dataDir, WS_FIXTURE: fixture, WS_EMAIL: email }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out));
  });
}

(async () => {
  const child = await boot();
  try {
    const A = 'semana-a@x.example', B = 'semana-b@x.example', C = 'semana-c@x.example', D = 'semana-d@x.example';
    const regA = await call('POST', '/api/auth/register', { email: A, password: 'secreto1' });
    const ckA = regA.cookie;
    ok('registro A con sesión', !!ckA, regA.status);
    await call('POST', '/api/auth/register', { email: B, password: 'secreto1' });
    const regC = await call('POST', '/api/auth/register', { email: C, password: 'secreto1' });
    const ckC = regC.cookie;
    const regD = await call('POST', '/api/auth/register', { email: D, password: 'secreto1' });
    const ckD = regD.cookie;
    ok('seed A', /seed a ok/.test(await runSeed('a', A)));
    ok('seed B', /seed b ok/.test(await runSeed('b', B)));
    ok('seed D', /seed d ok/.test(await runSeed('d', D)));

    // Sin sesión no hay control del link.
    const noauth = await call('GET', '/api/week-share');
    ok('sin sesión: 401', noauth.status === 401, noauth.status);

    // Estado inicial: apagado, sin link.
    const st0 = await call('GET', '/api/week-share', null, ckA);
    ok('estado inicial: inactivo y sin url', st0.data && st0.data.active === false && st0.data.url === null, JSON.stringify(st0.data).slice(0, 120));

    // Alta: nace el link.
    const en1 = await call('POST', '/api/week-share/enable', {}, ckA);
    const url1 = en1.data && en1.data.url;
    ok('enable devuelve link /semana/…', !!(en1.data && en1.data.active === true && url1 && url1.startsWith('/semana/')), JSON.stringify(en1.data).slice(0, 140));
    const st1 = await call('GET', '/api/week-share', null, ckA);
    ok('el estado refleja el link vigente', st1.data && st1.data.active === true && st1.data.url === url1);

    // La página pública, sin sesión: la semana de A y SOLO la de A.
    const page = await call('GET', url1);
    const html = page.text;
    ok('la página abre sin sesión (200)', page.status === 200, page.status);
    ok('dice de quién es la semana', html.includes('La semana de @negocio.a') && html.includes('Panadería La Espiga'));
    ok('caption tal cual, sin mayúsculas forzadas', html.includes('todo en minúscula, tal cual lo escribí') && !html.includes('TODO EN MINÚSCULA'), '');
    ok('caption + hashtags juntos', html.includes('#panaderia #barrio'));
    ok('foto del posteo', html.includes('/media/ws-p1.jpg'));
    ok('el reel como video', html.includes('<video') && html.includes('/media/ws-reel.mp4'));
    ok('carrusel con sus placas', html.includes('/media/ws-c1.jpg') && html.includes('/media/ws-c2.jpg'));
    const i1 = html.indexOf('todo en minúscula'), i2 = html.indexOf('Así amasamos'), i3 = html.indexOf('La semana en fotos');
    ok('orden de la semana (programado)', i1 > -1 && i2 > i1 && i3 > i2, `${i1},${i2},${i3}`);
    ok('NADA de otra cuenta', !html.includes('POSTEO-DE-OTRA-CUENTA'));
    ok('cancelado fuera', !html.includes('CANCELADO-NO-DEBE-VERSE'));
    ok('en revisión fuera', !html.includes('EN-REVISION-NO-DEBE-VERSE'));
    ok('semana pasada fuera', !html.includes('SEMANA-PASADA-NO-DEBE-VERSE'));
    ok('sin datos privados (email)', !html.includes(A));
    ok('cero superficie de acción', !html.includes('<button') && !html.includes('<form') && !html.includes('/api/') && !html.includes('Aprobar') && !html.includes('href="/#'), '');
    ok('pie discreto de Posty', html.includes('Hecha con') && html.includes('Posty'));

    // Token adulterado / ajeno / basura → 404.
    const tampered = await call('GET', url1.slice(0, -2) + 'xx');
    ok('token adulterado → 404', tampered.status === 404, tampered.status);
    const garbage = await call('GET', '/semana/basura');
    ok('token basura → 404', garbage.status === 404, garbage.status);

    // Regenerar: el viejo muere al instante, el nuevo anda.
    const rg = await call('POST', '/api/week-share/regenerate', {}, ckA);
    const url2 = rg.data && rg.data.url;
    ok('regenerar devuelve un link distinto', !!(url2 && url2 !== url1), String(url2).slice(0, 60));
    const oldDead = await call('GET', url1);
    ok('el link viejo muere al instante', oldDead.status === 404, oldDead.status);
    const newOk = await call('GET', url2);
    ok('el link nuevo funciona', newOk.status === 200, newOk.status);

    // Vista viva: un posteo nuevo aparece sin regenerar el link.
    ok('seed A2', /seed a2 ok/.test(await runSeed('a2', A)));
    const live = await call('GET', url2);
    ok('la página es vista viva de la semana', live.status === 200 && live.text.includes('POSTEO-NUEVO-EN-VIVO'));

    // Revocar: muere al instante; re-habilitar crea uno que anda.
    const rv = await call('POST', '/api/week-share/revoke', {}, ckA);
    ok('revoke apaga', rv.data && rv.data.active === false);
    const dead = await call('GET', url2);
    ok('el link revocado da 404', dead.status === 404, dead.status);
    const en2 = await call('POST', '/api/week-share/enable', {}, ckA);
    const back = await call('GET', en2.data.url);
    ok('re-habilitar: el link vuelve a andar', back.status === 200, back.status);

    // Semana vacía: estado honesto (cuenta C, sin posteos).
    const enC = await call('POST', '/api/week-share/enable', {}, ckC);
    const pageC = await call('GET', enC.data.url);
    ok('semana vacía: 200 con estado honesto', pageC.status === 200 && pageC.text.includes('Todavía no hay posteos armados'), pageC.status + ' ' + pageC.text.slice(0, 120));

    // Idioma por cuenta: D es EN.
    const enD = await call('POST', '/api/week-share/enable', {}, ckD);
    const pageD = await call('GET', enD.data.url);
    ok('cuenta EN: página en inglés', pageD.status === 200 && pageD.text.includes('<html lang="en"') && pageD.text.includes('The week of @biz.d') && pageD.text.includes('fresh bread every morning') && pageD.text.includes('Made with'), pageD.status);
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
  }
  console.log(`test-week-share: ${passed} ok / ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
