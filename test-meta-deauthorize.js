#!/usr/bin/env node
// (Frente 4b) DEAUTHORIZE CALLBACK DE META — POST /api/meta/deauthorize.
// Meta manda signed_request (HMAC-SHA256 con el App Secret) cuando un
// usuario desautoriza la app. Se prueba el flujo HTTP real (boot con
// DATA_DIR propio, cero red externa):
//  · firmado válido → 200, baja LÓGICA de la conexión IG (token/ig_user_id
//    limpios, profiles.ig_connected=0, last_ig_user_id conservado,
//    ig_revoked_at + ig_revoked_reason='meta_deauthorize') SIN borrar datos
//    del cliente (su posteo sigue) + evento durable 'deauthorized'.
//  · firma inválida → 400 y la conexión de OTRA cuenta queda intacta.
//  · cuenta sin conexión IG → 200 sano {deauthorized:false}, evento
//    'no_connection'.
//  · sin META_APP_SECRET en el entorno → FAIL-CLOSED: 503 controlado, la
//    conexión queda intacta y el intento queda registrado.
//  · los eventos se consultan por GET /api/admin/meta-deauthorize-events.
// Uso: node test-meta-deauthorize.js
const assert = require('assert');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
};

const SECRET = 'test-meta-secret';
function signedRequest(userId, secret) {
  const payloadB64u = Buffer.from(JSON.stringify({ user_id: String(userId), algorithm: 'HMAC-SHA256', issued_at: 1700000000 }))
    .toString('base64url');
  const sigB64u = crypto.createHmac('sha256', secret).update(payloadB64u).digest('base64url');
  return sigB64u + '.' + payloadB64u;
}

async function boot(port, extraEnv) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-deauth-'));
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' };
  delete env.META_APP_SECRET; delete env.IG_APP_SECRET;
  Object.assign(env, extraEnv || {});
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(base + '/api/version'); up = r.ok; } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  assert(up, 'el servidor no levantó:\n' + log.slice(-1500));
  return { child, base, dataDir };
}

function seedUser(rw, email, igUserId) {
  const u = rw.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  const uid = Number(u.lastInsertRowid);
  rw.prepare('INSERT INTO profiles (user_id, business_name, ig_username, ig_connected) VALUES (?, ?, ?, 1)')
    .run(uid, 'Negocio ' + uid, 'neg_' + uid);
  rw.prepare('INSERT INTO settings (user_id, ig_user_id, ig_page_id, ig_access_token) VALUES (?, ?, ?, ?)')
    .run(uid, igUserId, 'page-' + igUserId, 'tok-' + igUserId);
  rw.prepare("INSERT INTO posts (user_id, image_path, caption) VALUES (?, '/media/x.jpg', 'posteo del cliente')").run(uid);
  return uid;
}

async function postDeauth(base, sr) {
  const r = await fetch(base + '/api/meta/deauthorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: sr }).toString(),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

(async () => {
  const { DatabaseSync } = require('node:sqlite');

  // ── Fase 1: con secreto configurado ──────────────────────────────────────
  const a = await boot(3993, { META_APP_SECRET: SECRET });
  try {
    const rw = new DatabaseSync(path.join(a.dataDir, 'posta.db'));
    const uid1 = seedUser(rw, 'uno@test.com', 'META_U1');
    const uid2 = seedUser(rw, 'dos@test.com', 'META_U2');

    // Firma inválida sobre la cuenta 2: rechazo y conexión intacta.
    let r = await postDeauth(a.base, signedRequest('META_U2', 'secreto-equivocado'));
    ok('firma inválida → 400', r.status === 400, r);
    let s2 = rw.prepare('SELECT ig_user_id, ig_access_token FROM settings WHERE user_id = ?').get(uid2);
    ok('firma inválida → sin baja (conexión intacta)', s2.ig_user_id === 'META_U2' && s2.ig_access_token === 'tok-META_U2', s2);
    let ev = rw.prepare("SELECT * FROM meta_deauthorize_events WHERE status = 'invalid_signature'").all();
    ok('firma inválida → evento registrado', ev.length === 1, ev);

    // Firmado válido sobre la cuenta 1: baja lógica completa.
    r = await postDeauth(a.base, signedRequest('META_U1', SECRET));
    ok('válido → 200 deauthorized', r.status === 200 && r.body.ok === true && r.body.deauthorized === true, r);
    const s1 = rw.prepare('SELECT * FROM settings WHERE user_id = ?').get(uid1);
    ok('baja lógica: ig_user_id/token/página limpios', s1.ig_user_id === '' && s1.ig_access_token === '' && s1.ig_page_id === '', s1);
    ok('baja lógica: last_ig_user_id conserva la cuenta', s1.last_ig_user_id === 'META_U1', s1);
    ok('baja lógica: marca de revocación con motivo', !!s1.ig_revoked_at && s1.ig_revoked_reason === 'meta_deauthorize', s1);
    const p1 = rw.prepare('SELECT ig_connected FROM profiles WHERE user_id = ?').get(uid1);
    ok('baja lógica: profiles.ig_connected=0', p1.ig_connected === 0, p1);
    const posts = rw.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid1);
    ok('SIN borrar datos del cliente (su posteo sigue)', posts.n === 1, posts);
    ev = rw.prepare("SELECT * FROM meta_deauthorize_events WHERE status = 'deauthorized'").all();
    ok('evento deauthorized durable con user_id', ev.length === 1 && Number(ev[0].user_id) === uid1 && ev[0].meta_user_id === 'META_U1', ev);

    // Cuenta sin conexión IG: respuesta sana, sin error.
    r = await postDeauth(a.base, signedRequest('META_DESCONOCIDO', SECRET));
    ok('sin conexión → 200 sano deauthorized:false', r.status === 200 && r.body.ok === true && r.body.deauthorized === false, r);
    ev = rw.prepare("SELECT * FROM meta_deauthorize_events WHERE status = 'no_connection'").all();
    ok('sin conexión → evento no_connection', ev.length === 1 && ev[0].meta_user_id === 'META_DESCONOCIDO', ev);

    // Reintento del mismo deauthorize (Meta reintenta): idempotente.
    r = await postDeauth(a.base, signedRequest('META_U1', SECRET));
    ok('reintento → 200 sano (ya no hay conexión)', r.status === 200 && r.body.deauthorized === false, r);

    // Consulta admin de eventos.
    const adm = await fetch(a.base + '/api/admin/meta-deauthorize-events?token=test-admin');
    const admBody = await adm.json();
    ok('admin: eventos consultables', adm.status === 200 && admBody.ok && admBody.events.length >= 4, admBody);
    const noAdm = await fetch(a.base + '/api/admin/meta-deauthorize-events');
    ok('admin: sin token → 403', noAdm.status === 403, noAdm.status);
    rw.close();
  } finally { a.child.kill('SIGKILL'); }

  // ── Fase 2: sin secreto en el entorno → fail-closed ─────────────────────
  const b = await boot(3994, {});
  try {
    const rw = new DatabaseSync(path.join(b.dataDir, 'posta.db'));
    const uid = seedUser(rw, 'tres@test.com', 'META_U3');
    const r = await postDeauth(b.base, signedRequest('META_U3', SECRET));
    ok('sin secreto → 503 controlado (sin crash)', r.status === 503 && r.body.ok === false, r);
    const s = rw.prepare('SELECT ig_user_id, ig_access_token FROM settings WHERE user_id = ?').get(uid);
    ok('sin secreto → fail-closed: conexión intacta', s.ig_user_id === 'META_U3' && s.ig_access_token === 'tok-META_U3', s);
    const ev = rw.prepare("SELECT * FROM meta_deauthorize_events WHERE status = 'secret_missing'").all();
    ok('sin secreto → intento registrado', ev.length === 1, ev);
    rw.close();
  } finally { b.child.kill('SIGKILL'); }

  console.log(`\n${failed ? '✗' : '✓'} test-meta-deauthorize: ${passed} ok, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
