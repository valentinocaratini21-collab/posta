#!/usr/bin/env node
// test-magic-email-p0.js — (P0 2026-10-24) El email de acceso no salía.
//
// Causa raíz probada: en /api/auth/magic-request, `emailSent` estaba declarado
// DENTRO del try pero el chequeo final corría FUERA → ReferenceError en cada
// alta sin sesión inmediata → el handler async nunca respondía (cuelgue
// infinito; el cliente veía «Algo salió mal» tras >60 s). Y el rechazo de
// Resend solo vivía en console.error (logs efímeros), invisible para el admin.
//
// Este test cubre:
//  A) sin RESEND_API_KEY: el alta que depende del correo responde 503 RÁPIDO
//     (nunca cuelga) y deja su fila durable 'not_attempted' en email_send_log;
//     el alta con prueba sigue entrando con sesión inmediata; email inválido
//     sigue respondiendo {ok:true} (no revela existencia).
//  B) con un Resend falso local (RESEND_API_URL): si acepta → 200 y fila
//     'sent' con el id del proveedor; si rechaza 403 (dominio sin verificar)
//     → 503 rápido y fila 'rejected' con el motivo literal del proveedor.
//  C) el registro se lee por GET /api/admin/email-log (con token; sin token 403).
//  D) vecino intacto: /api/auth/forgot con email inexistente sigue en 200.
//
// Uso: node test-magic-email-p0.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 300) : ''); }
};

// ---------- estático ----------
console.log('— estático: wiring del fix');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const eml = fs.readFileSync(path.join(__dirname, 'email.js'), 'utf8');
const dbl = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
ok('server: emailSent declarado UNA sola vez (hoisted fuera del try)', (srv.match(/let emailSent = false;/g) || []).length === 1);
ok('server: registra el logger durable (setSendLogger)', srv.includes('setSendLogger'));
ok('server: endpoint admin del registro', srv.includes("app.get('/api/admin/email-log'"));
ok('email: exporta setSendLogger y captura el id del proveedor', eml.includes('setSendLogger') && eml.includes('providerId'));
ok('email: RESEND_API_URL configurable para tests', eml.includes('RESEND_API_URL'));
ok('db: tabla email_send_log', dbl.includes('CREATE TABLE IF NOT EXISTS email_send_log'));

// ---------- Resend falso ----------
let stubMode = 'ok';
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (stubMode === 'ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'stub-abc-123' }));
    } else {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: 'validation_error', message: 'The postycommunitymanager.com domain is not verified. Please, add it in your account settings.' }));
    }
  });
});

const ADMIN = 'test-admin';
const emailLogUrl = (base) => base + '/api/admin/email-log?' + new URLSearchParams({ token: ADMIN }).toString();

async function boot(port, extraEnv) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-p0-'));
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', ...extraEnv };
  delete env.RESEND_API_KEY; delete env.RESEND_API_URL;
  Object.assign(env, extraEnv || {});
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try { const r = await fetch(base + '/api/version'); up = r.ok; } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  assert(up, 'el servidor no levantó:\n' + bootLog.slice(-1200));
  return { child, base };
}

async function magic(base, body) {
  const t0 = Date.now();
  const r = await fetch(base + '/api/auth/magic-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000), // si cuelga como en v363, el test FALLA acá
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, j };
}

(async () => {
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const stubUrl = `http://127.0.0.1:${stub.address().port}/emails`;

  // ---------- Boot A: sin clave ----------
  console.log('— boot A: sin RESEND_API_KEY');
  {
    const { child, base } = await boot(4317, {});
    try {
      const inv = await magic(base, { email: 'no-es-email' });
      ok('A: email inválido → 200 {ok:true} (no revela)', inv.status === 200 && inv.j.ok === true, JSON.stringify(inv.j));

      const sin = await magic(base, { email: 'p0-sin-clave@example.com' });
      ok('A: alta sin prueba y sin clave → 503 (NO cuelga)', sin.status === 503, `status=${sin.status} ms=${sin.ms}`);
      ok('A: 503 rápido (<5 s)', sin.ms < 5000, sin.ms);
      ok('A: 503 honesto (menciona el email de acceso)', /email de acceso/.test(sin.j.error || ''), sin.j.error);

      const con = await magic(base, { email: 'p0-con-prueba@example.com', trial_profile: { business_name: 'Prueba P0' } });
      ok('A: alta con prueba → sesión inmediata 200', con.status === 200 && con.j.session === true, JSON.stringify(con.j).slice(0, 200));

      const logR = await fetch(emailLogUrl(base));
      const logJ = await logR.json();
      ok('A: email-log responde con token admin', logR.status === 200 && logJ.ok === true, logR.status);
      const row = (logJ.rows || []).find((x) => x.to_email === 'p0-sin-clave@example.com');
      ok("A: fila durable 'not_attempted' del intento sin clave", !!row && row.status === 'not_attempted' && /RESEND_API_KEY/.test(row.error || ''), row && JSON.stringify(row).slice(0, 200));

      const noTok = await fetch(base + '/api/admin/email-log');
      ok('A: email-log sin token → 403', noTok.status === 403, noTok.status);
    } finally { child.kill('SIGKILL'); }
  }

  // ---------- Boot B: Resend falso ----------
  console.log('— boot B: Resend falso (acepta / rechaza)');
  {
    const { child, base } = await boot(4318, { RESEND_API_KEY: 'stub-key', RESEND_API_URL: stubUrl });
    try {
      stubMode = 'ok';
      const acc = await magic(base, { email: 'p0-acepta@example.com' });
      ok('B: proveedor acepta → 200 {ok:true} sin sesión', acc.status === 200 && acc.j.ok === true && !acc.j.session, JSON.stringify(acc.j));
      ok('B: respuesta rápida (<5 s)', acc.ms < 5000, acc.ms);

      stubMode = 'reject';
      const rej = await magic(base, { email: 'p0-rechaza@example.com' });
      ok('B: proveedor rechaza → 503 rápido (NO cuelga)', rej.status === 503 && rej.ms < 5000, `status=${rej.status} ms=${rej.ms}`);

      const logR = await fetch(emailLogUrl(base));
      const logJ = await logR.json();
      const sent = (logJ.rows || []).find((x) => x.to_email === 'p0-acepta@example.com');
      ok("B: fila 'sent' con el id del proveedor", !!sent && sent.status === 'sent' && sent.provider_id === 'stub-abc-123', sent && JSON.stringify(sent).slice(0, 200));
      const rejd = (logJ.rows || []).find((x) => x.to_email === 'p0-rechaza@example.com');
      ok("B: fila 'rejected' con HTTP 403 y el motivo literal", !!rejd && rejd.status === 'rejected' && rejd.http_status === 403 && /domain is not verified/.test(rejd.error || ''), rejd && JSON.stringify(rejd).slice(0, 250));
      ok('B: last_error expone el último rechazo', !!logJ.last_error && logJ.last_error.status === 'rejected');

      const fg = await fetch(base + '/api/auth/forgot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nadie@example.com' }), signal: AbortSignal.timeout(8000),
      });
      const fgJ = await fg.json().catch(() => ({}));
      ok('D: forgot con email inexistente → 200 {ok:true} (vecino intacto)', fg.status === 200 && fgJ.ok === true, fg.status);
    } finally { child.kill('SIGKILL'); }
  }

  stub.close();
  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); stub.close(); process.exit(1); });
