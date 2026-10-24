#!/usr/bin/env node
// test-email-timeout.js — (v375) Anti-cuelgue REAL del envío de email.
//
// El test del P0 (test-magic-email-p0) simula un proveedor que ACEPTA o que
// RECHAZA rápido — por eso pasaba aunque la clase de falla «el proveedor no
// responde nunca» quedara sin cubrir. Este test apunta el envío a un stub
// que ACEPTA la conexión y NO RESPONDE JAMÁS, y verifica la garantía de
// v375 (endurecimiento del choke point único, email.js#sendEmail):
//
//  - el handler responde SIEMPRE dentro de la cota (10 s/intento en
//    producción; acá EMAIL_SEND_TIMEOUT_MS=1200 → ~3,2 s por envío:
//    intento + pausa acotada + 1 reintento), con el error honesto;
//  - hay EXACTAMENTE 2 intentos por envío (1 reintento, nunca más);
//  - el intento queda en email_send_log con el motivo literal 'timeout'
//    aunque el proveedor nunca haya contestado;
//  - el servidor sigue respondiendo otras rutas MIENTRAS un envío cuelga.
//
// Cubre magic-request (ES y EN) y forgot con usuario existente.
//
// Uso: node test-email-timeout.js
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
console.log('— estático: el choke point endurecido');
const eml = fs.readFileSync(path.join(__dirname, 'email.js'), 'utf8');
ok('email: cota configurable por entorno (EMAIL_SEND_TIMEOUT_MS)', eml.includes('EMAIL_SEND_TIMEOUT_MS'));
ok('email: timeout duro con AbortSignal por intento', eml.includes('AbortSignal.timeout(timeoutMs)'));
ok('email: motivo literal timeout en el desenlace durable', eml.includes('timeout: el proveedor no respondió'));
ok('email: a lo sumo 2 intentos (1 reintento)', eml.includes('attempt <= 2'));

// ---------- stub que NUNCA responde ----------
let stubHits = 0;
const stubSockets = new Set();
const stub = http.createServer((req, res) => {
  stubHits++;
  req.on('data', () => {});
  // Jamás res.end(): la conexión queda abierta y muda para siempre.
});
stub.on('connection', (s) => { stubSockets.add(s); s.on('close', () => stubSockets.delete(s)); });

const ADMIN = 'test-admin';
const emailLogUrl = (base) => base + '/api/admin/email-log?' + new URLSearchParams({ token: ADMIN }).toString();

async function boot(port, extraEnv) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-timeout-'));
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_TOKEN: ADMIN, SESSION_SECRET: 'test-secret', ...extraEnv };
  delete env.EMAIL_FROM;
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

async function post(base, route, body) {
  const t0 = Date.now();
  const r = await fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000), // guarda del test: si el handler cuelga, FALLA acá
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, j };
}

(async () => {
  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const stubUrl = `http://127.0.0.1:${stub.address().port}/emails`;

  console.log('— boot: Resend mudo (nunca responde), cota 1200 ms/intento');
  const { child, base } = await boot(4421, {
    RESEND_API_KEY: 'stub-key',
    RESEND_API_URL: stubUrl,
    EMAIL_SEND_TIMEOUT_MS: '1200',
  });
  try {
    // 1) Alta con prueba: el envío del magic link cuelga, pero la sesión
    //    inmediata tiene que nacer igual — y el envío, acotado y reintentado.
    let hits0 = stubHits;
    const seed = await post(base, '/api/auth/magic-request', { email: 'timeout-user@example.com', trial_profile: { business_name: 'Timeout Test' } });
    ok('alta con prueba: sesión inmediata 200 pese al proveedor mudo', seed.status === 200 && seed.j.session === true, `status=${seed.status} ${JSON.stringify(seed.j).slice(0, 160)}`);
    ok('alta con prueba: envío acotado (<15 s)', seed.ms < 15000, seed.ms);
    ok('alta con prueba: exactamente 2 intentos al proveedor', stubHits - hits0 === 2, `hits=${stubHits - hits0}`);

    // 2) Cuenta existente: el handler responde el 503 honesto dentro de la
    //    cota — y el servidor atiende otras rutas MIENTRAS el envío cuelga.
    hits0 = stubHits;
    const pending = post(base, '/api/auth/magic-request', { email: 'timeout-user@example.com' });
    await new Promise((r) => setTimeout(r, 300));
    const t0 = Date.now();
    const ver = await fetch(base + '/api/version', { signal: AbortSignal.timeout(5000) });
    const verMs = Date.now() - t0;
    ok('mientras un envío cuelga, /api/version responde rápido', ver.ok && verMs < 3000, `ms=${verMs}`);
    const magic = await pending;
    ok('magic (existente): 503 honesto, NO cuelga', magic.status === 503 && /email de acceso/.test(magic.j.error || ''), `status=${magic.status} ${JSON.stringify(magic.j).slice(0, 160)}`);
    ok('magic (existente): dentro de la cota (<15 s) y con espera real (>2 s)', magic.ms < 15000 && magic.ms > 2000, magic.ms);
    ok('magic (existente): exactamente 2 intentos', stubHits - hits0 === 2, `hits=${stubHits - hits0}`);

    // 3) El desenlace quedó durable con el motivo literal 'timeout'.
    const logR = await fetch(emailLogUrl(base));
    const logJ = await logR.json();
    const rowsUser = (logJ.rows || []).filter((x) => x.to_email === 'timeout-user@example.com');
    ok("email-log: los intentos al proveedor mudo quedaron registrados", rowsUser.length >= 2, `rows=${rowsUser.length}`);
    ok("email-log: motivo literal 'timeout' en el desenlace", rowsUser.length >= 2 && rowsUser.every((x) => x.status === 'error' && /^timeout/.test(x.error || '')), rowsUser.map((x) => `${x.status}:${String(x.error).slice(0, 40)}`).join(' | '));

    // 4) EN: el 503 sale en inglés y también acotado.
    hits0 = stubHits;
    const en = await post(base, '/api/auth/magic-request', { email: 'timeout-en@example.com', lang: 'en' });
    ok('magic EN: 503 en inglés dentro de la cota', en.status === 503 && /couldn't send the sign-in email/.test(en.j.error || '') && en.ms < 15000, `status=${en.status} ms=${en.ms} ${JSON.stringify(en.j).slice(0, 160)}`);
    ok('magic EN: exactamente 2 intentos', stubHits - hits0 === 2, `hits=${stubHits - hits0}`);
    const logR2 = await fetch(emailLogUrl(base));
    const logJ2 = await logR2.json();
    const rowEn = (logJ2.rows || []).find((x) => x.to_email === 'timeout-en@example.com');
    ok("email-log: fila 'timeout' también para el intento EN", !!rowEn && rowEn.status === 'error' && /^timeout/.test(rowEn.error || ''), rowEn && JSON.stringify(rowEn).slice(0, 200));

    // 5) forgot con usuario existente: el 502 honesto dentro de la cota.
    hits0 = stubHits;
    const fg = await post(base, '/api/auth/forgot', { email: 'timeout-user@example.com' });
    ok('forgot (existente): 502 honesto, NO cuelga', fg.status === 502 && /No pude enviar el email/.test(fg.j.error || ''), `status=${fg.status} ${JSON.stringify(fg.j).slice(0, 160)}`);
    ok('forgot: dentro de la cota (<15 s)', fg.ms < 15000, fg.ms);
    ok('forgot: exactamente 2 intentos', stubHits - hits0 === 2, `hits=${stubHits - hits0}`);
  } finally {
    child.kill('SIGKILL');
    for (const s of stubSockets) s.destroy();
    stub.close();
  }

  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); for (const s of stubSockets) s.destroy(); stub.close(); process.exit(1); });
