#!/usr/bin/env node
// test-device-tokens.js — (Frente 5) Cuentas guardadas en este dispositivo.
// Unidad del módulo device-tokens (hash, rotación, revocación, vencimiento)
// + wiring estático (rutas ANTES del catch-all, strings ES/EN, cliente) +
// flujo HTTP completo con el server booteado (register/login → token →
// logout → exchange sin contraseña → rotación → revoke → ya no entra).
// Uso: node test-device-tokens.js
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 200) : ''); }
};
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------------- Unidad: device-tokens.js ----------------
console.log('— unidad: device-tokens');
const dt = require('./device-tokens.js');
{
  const db = new DatabaseSync(':memory:');
  const a = dt.issue(db, 42);
  ok('issue: token de 64 hex', /^[0-9a-f]{64}$/.test(a.token));
  ok('issue: vigencia ~60 días', Math.abs((a.expiresAt - Date.now()) - dt.TTL_MS) < 5000);
  const row = dt.rowForToken(db, a.token);
  ok('hash en base: la fila existe por hash', !!row);
  ok('hash en base: token_hash = sha256(token)', row && row.token_hash === sha256(a.token));
  ok('hash en base: NUNCA el token en claro', row && row.token_hash !== a.token && !JSON.stringify(row).includes(a.token));
  ok('fila: user_id correcto, no revocada', row && row.user_id === 42 && row.revoked === 0);

  const ex1 = dt.exchange(db, a.token);
  ok('exchange válido: devuelve userId y token NUEVO', !!ex1 && ex1.userId === 42 && /^[0-9a-f]{64}$/.test(ex1.token) && ex1.token !== a.token);
  ok('rotación: el token usado queda revocado', dt.rowForToken(db, a.token).revoked === 1);
  ok('rotación: reutilizar el viejo FALLA', dt.exchange(db, a.token) === null);
  const ex2 = dt.exchange(db, ex1.token);
  ok('exchange del rotado: funciona', !!ex2 && ex2.userId === 42);

  const b = dt.issue(db, 42);
  ok('revoke: devuelve true sobre token vivo', dt.revoke(db, b.token) === true);
  ok('revocado: el exchange FALLA', dt.exchange(db, b.token) === null);
  ok('revoke: idempotente (segunda vez false)', dt.revoke(db, b.token) === false);

  const old = dt.issue(db, 7, Date.now() - dt.TTL_MS - 1000);
  ok('vencido: el exchange FALLA', dt.exchange(db, old.token) === null);

  const c1 = dt.issue(db, 9); const c2 = dt.issue(db, 9); const other = dt.issue(db, 10);
  dt.revokeAllForUser(db, 9);
  ok('revokeAllForUser: corta todas las del usuario', dt.exchange(db, c1.token) === null && dt.exchange(db, c2.token) === null);
  ok('revokeAllForUser: no toca a otros usuarios', !!dt.exchange(db, other.token));
  ok('basura: exchange de token inválido = null', dt.exchange(db, 'no-es-un-token') === null && dt.exchange(db, '') === null);
  db.close();
}

// ---------------- Wiring estático ----------------
console.log('— wiring estático');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const idxHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const pruebaEs = fs.readFileSync(path.join(__dirname, 'public', 'prueba.html'), 'utf8');
const pruebaEn = fs.readFileSync(path.join(__dirname, 'public', 'en-prueba.html'), 'utf8');
{
  const iEx = srv.indexOf("app.post('/api/auth/device-exchange'");
  const iRv = srv.indexOf("app.post('/api/auth/device-revoke'");
  const iCatch = srv.indexOf("\napp.get('*', (req, res)");
  ok('server: rutas device-exchange y device-revoke existen', iEx > 0 && iRv > 0);
  ok('server: rutas registradas ANTES del catch-all app.get(\'*\')', iEx > 0 && iCatch > iEx && iCatch > iRv);
  ok('server: exchange usa el limiter del auth (authHitCount)', srv.slice(iEx, iEx + 1600).includes('authHitCount'));
  ok('server: login emite device_token', srv.includes("device token (login)") && srv.includes('device_token: dt ? dt.token : null'));
  ok('server: register emite device_token', srv.includes('device token (register)'));
  ok('server: magic-request (sesión inmediata) emite device_token', srv.includes('deviceDt = deviceTokens.issue'));
  ok('server: reset revoca todos y emite fresco', srv.includes('deviceTokens.revokeAllForUser'));
  ok('server: BUILD_ID provisorio del frente', srv.includes("const BUILD_ID = '20261023-v355'"));

  ok('app.js: clave localStorage de cuentas guardadas', appJs.includes("SAVED_ACCOUNTS_KEY = 'posty_saved_accounts'"));
  ok('app.js: strings ES (Continuar como / Usar otra cuenta / Quitar)', appJs.includes("cont: 'Continuar como'") && appJs.includes("other: 'Usar otra cuenta'") && appJs.includes("remove: 'Quitar'"));
  ok('app.js: strings EN (Continue as / Use another account / Remove)', appJs.includes("cont: 'Continue as'") && appJs.includes("other: 'Use another account'") && appJs.includes("remove: 'Remove'"));
  ok('app.js: la lista se pinta solo en login con cuentas (authView + bindSavedAccounts)', appJs.includes('id="savedAccounts"') && appJs.includes('bindSavedAccounts()'));
  ok('app.js: un toque llama a device-exchange', appJs.includes("api.post('/api/auth/device-exchange'"));
  ok('app.js: la × llama a device-revoke', appJs.includes("api.post('/api/auth/device-revoke'"));
  ok('app.js: guarda tras login/register OK (savedAccountsSave)', appJs.includes('savedAccountsSave((authResp && authResp.email)'));
  ok('app.js: la contraseña NO se persiste (ningún guardado la incluye)', !/savedAccountsSave\([^)]*password/.test(appJs) && !appJs.includes("token: String(a.token), password"));
  ok('app.js: caída suave con email precargado (savedShowForm + status 401)', appJs.includes('savedShowForm(email, S.soft)') && appJs.includes('e.status === 401'));
  ok('styles.css: estilos de filas .saved-acct', css.includes('.saved-acct') && css.includes('.saved-acct-x') && css.includes('.saved-other'));
  ok('index.html: app.js con ?v= bumpeado (238)', idxHtml.includes('/app.js?v=238'));
  ok('prueba ES: guarda la cuenta tras sesión inmediata', pruebaEs.includes("resp.device_token") && pruebaEs.includes("'posty_saved_accounts'"));
  ok('prueba EN: guarda la cuenta tras sesión inmediata', pruebaEn.includes("resp.device_token") && pruebaEn.includes("'posty_saved_accounts'"));
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid };
}

(async () => {
  console.log('— http: flujo completo con server booteado');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-device-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    ok('server bootea', up, bootLog.slice(-300));
    const ver = await call('GET', '/api/version');
    ok('versión: BUILD_ID provisorio 20261023-v355', ver.data.build === '20261023-v355', ver.data.build);

    // Registro A: emite sesión + token
    const regA = await call('POST', '/api/auth/register', { email: 'ana@example.com', password: 'secreto1' });
    ok('register A: 200 con device_token', regA.status === 200 && /^[0-9a-f]{64}$/.test(regA.data.device_token || ''), JSON.stringify(regA.data).slice(0, 160));
    ok('register A: devuelve su email canónico', regA.data.email === 'ana@example.com');
    const tokenA1 = regA.data.device_token;
    const meA = await call('GET', '/api/auth/me', null, regA.cookie);
    ok('register A: la sesión quedó abierta (/me)', meA.data.user && meA.data.user.email === 'ana@example.com');

    // Registro B (multi-cuenta en el servidor: tokens independientes)
    const regB = await call('POST', '/api/auth/register', { email: 'beto@example.com', password: 'secreto2' });
    ok('register B: token propio, distinto del de A', regB.status === 200 && regB.data.device_token && regB.data.device_token !== tokenA1);

    // Logout de A: la sesión muere, el token del dispositivo NO
    await call('POST', '/api/auth/logout', {}, regA.cookie);
    const meOut = await call('GET', '/api/auth/me', null, regA.cookie);
    ok('logout: /me ya no devuelve usuario', !meOut.data.user);

    // "Continuar como": exchange sin contraseña → sesión + rotación
    const exA = await call('POST', '/api/auth/device-exchange', { token: tokenA1 });
    ok('exchange A: 200 y rota el token', exA.status === 200 && exA.data.device_token && exA.data.device_token !== tokenA1);
    ok('exchange A: no devuelve datos de la cuenta (solo sesión + token nuevo)', !('user' in exA.data) && !('email' in exA.data));
    const tokenA2 = exA.data.device_token;
    const meEx = await call('GET', '/api/auth/me', null, exA.cookie);
    ok('exchange A: la sesión nueva es de A', meEx.data.user && meEx.data.user.email === 'ana@example.com');

    // El token viejo reutilizado FALLA (rotación)
    const reuse = await call('POST', '/api/auth/device-exchange', { token: tokenA1 });
    ok('rotación: reutilizar el token viejo → 401', reuse.status === 401);

    // Login con contraseña: emite un token fresco (la lista del dispositivo se actualiza)
    const loginA = await call('POST', '/api/auth/login', { email: 'ana@example.com', password: 'secreto1' });
    ok('login A: 200 con device_token fresco', loginA.status === 200 && /^[0-9a-f]{64}$/.test(loginA.data.device_token || ''));

    // Base: jamás el token en claro; el vigente está por hash y vivo
    const dbFile = path.join(dataDir, 'posta.db');
    const ro = new DatabaseSync(dbFile, { readOnly: true });
    const rows = ro.prepare('SELECT * FROM device_tokens').all();
    ok('db: hay filas de device_tokens', rows.length >= 3, String(rows.length));
    ok('db: NINGUNA fila guarda un token en claro', rows.every((r) => r.token_hash !== tokenA1 && r.token_hash !== tokenA2 && /^[0-9a-f]{64}$/.test(r.token_hash)));
    const rowA2 = rows.find((r) => r.token_hash === sha256(tokenA2));
    ok('db: el token vigente de A está por hash y vivo', !!rowA2 && rowA2.revoked === 0);
    const rowA1 = rows.find((r) => r.token_hash === sha256(tokenA1));
    ok('db: el token rotado quedó revocado con last_used_at', !!rowA1 && rowA1.revoked === 1 && rowA1.last_used_at > 0);
    ro.close();

    // Revocación (la ×): ese token ya no entra; el de B no se entera
    const rv = await call('POST', '/api/auth/device-revoke', { token: tokenA2 });
    ok('revoke: responde ok', rv.status === 200 && rv.data.ok === true);
    const exRevoked = await call('POST', '/api/auth/device-exchange', { token: tokenA2 });
    ok('revocado: exchange → 401', exRevoked.status === 401);
    const exB = await call('POST', '/api/auth/device-exchange', { token: regB.data.device_token });
    ok('multi-cuenta: revocar a A no afecta a B (exchange B ok)', exB.status === 200 && !!exB.data.device_token);

    // Rate-limit del exchange (limiter del auth): tras 10 fallos en la
    // ventana, el endpoint responde 429 igual que el login.
    let saw429 = false, lastStatus = 0;
    for (let i = 0; i < 14 && !saw429; i++) {
      const f = await call('POST', '/api/auth/device-exchange', { token: 'f'.repeat(63) + i.toString(16) });
      lastStatus = f.status;
      if (f.status === 429) saw429 = true;
    }
    ok('rate-limit: el exchange corta con 429 como el login', saw429, 'último status ' + lastStatus);
  } catch (e) {
    failed++;
    console.log('  ✗ excepción en el flujo HTTP:', e && e.message);
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})();
