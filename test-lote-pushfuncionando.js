#!/usr/bin/env node
// test-lote-pushfuncionando.js - LOTE PUSH-FUNCIONANDO: que las push anden.
// 1) La firma ES256 del provider token APNs tiene que ser P1363 (64 bytes):
//    con DER (71 bytes) Apple rechaza cada envío con 403 InvalidProviderToken
//    y NINGUNA push iOS salía. Discriminador: en v694 prístino da 71.
// 2) pushHealth() valida la config APNs sin red (PEM + curva + firma 64B).
// 3) apnsFailureReason: la razón real del fallo, no 'apns_no_configurado'.
// 4) Endpoints admin /api/admin/push/health y /api/admin/push/test.
// 5) Regresión: sendPush fail-closed + cliente nativo intacto.
// 6) Permiso iOS en denied: Ajustes dice el camino exacto (Ajustes del
//    iPhone → Posty → Notificaciones), el botón no reintenta en silencio
//    y no_token muestra el registrationError cuando iOS dejó uno.
// Uso: node test-lote-pushfuncionando.js [push.js] [server.js] [app.js] [chunk-ajustes.js]
//   Sin args: ./push.js, ./server.js y ./public/app.js (raíz del repo).
//   No toca red APNs/FCM: la firma y la salud se validan en local; el
//   boot E2E solo ejerce los endpoints (sin suscripciones -> no_subs).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, extra !== undefined ? String(extra).slice(0, 200) : ''); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64uDec = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const PUSHJS = path.resolve(process.argv[2] || path.join(__dirname, 'push.js'));
const SERVERJS = path.resolve(process.argv[3] || path.join(__dirname, 'server.js'));
const APPJS = path.resolve(process.argv[4] || path.join(__dirname, 'public', 'app.js'));
const AJUSTESJS = path.resolve(process.argv[5] || path.join(__dirname, 'public', 'chunk-ajustes.js'));

// Temp en el scratch del lote, no en /tmp.
const TMPBASE = path.join(__dirname, '..', 'tmp');
try { fs.mkdirSync(TMPBASE, { recursive: true }); } catch (e) {}

function genP256Pem() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return privateKey.export({ type: 'pkcs8', format: 'pem' });
}

async function main() {
  const push = require(PUSHJS);
  // Sin credenciales al arrancar: fail-closed primero.
  for (const k of ['FCM_SERVICE_ACCOUNT', 'APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_SANDBOX']) delete process.env[k];

  // ---------- A) Firma ES256 APNs: P1363, 64 bytes ----------
  console.log('- A · firma provider token APNs');
  const p8 = genP256Pem();
  process.env.APNS_KEY_P8 = p8;
  process.env.APNS_KEY_ID = 'TESTKEYID1';
  process.env.APNS_TEAM_ID = 'TESTTEAM01';
  const cfg = push._internal && push._internal.apnsConfig ? push._internal.apnsConfig() : null;
  ok('apnsConfig lee envs (host producción por defecto)', !!cfg && cfg.host === 'api.push.apple.com' && cfg.bundleId === 'com.postycommunitymanager.app', cfg && JSON.stringify(cfg));
  let sigLen = -1, jwt = '';
  try {
    jwt = push._internal.apnsProviderToken(cfg);
    const parts = String(jwt || '').split('.');
    sigLen = parts.length === 3 ? b64uDec(parts[2]).length : -1;
  } catch (e) { sigLen = -2; }
  ok('firma ES256 en P1363 (64 bytes, no DER 71)', sigLen === 64, 'sigLen=' + sigLen);
  process.env.APNS_SANDBOX = '1';
  const cfgSb = push._internal.apnsConfig();
  ok('APNS_SANDBOX=1 -> host sandbox', !!cfgSb && cfgSb.host === 'api.sandbox.push.apple.com', cfgSb && cfgSb.host);
  delete process.env.APNS_SANDBOX;

  // ---------- B) pushHealth ----------
  console.log('- B · pushHealth');
  ok('pushHealth existe', typeof push.pushHealth === 'function');
  let h1 = null;
  try { h1 = push.pushHealth(); } catch (e) { h1 = null; }
  ok('con envs APNs: configured + keyParseable + 64 bytes', !!h1 && h1.apns && h1.apns.configured === true && h1.apns.keyParseable === true && h1.apns.signatureBytes === 64 && h1.apns.host === 'api.push.apple.com', JSON.stringify(h1 && h1.apns));
  ok('health no expone secretos (sin PEM ni keyId)', !!h1 && !JSON.stringify(h1).includes('BEGIN EC PRIVATE KEY') && !JSON.stringify(h1).includes('TESTKEYID1') && !JSON.stringify(h1).includes('TESTTEAM01'), JSON.stringify(h1).slice(0, 300));
  delete process.env.APNS_KEY_P8; delete process.env.APNS_KEY_ID; delete process.env.APNS_TEAM_ID;
  let h0 = null;
  try { h0 = push.pushHealth(); } catch (e) { h0 = null; }
  ok('sin envs APNs: configured false', !!h0 && h0.apns && h0.apns.configured === false && h0.apns.keyPresent === false, JSON.stringify(h0 && h0.apns));
  ok('vapid/fcm sin env -> no configurados', !!h0 && h0.vapid.configured === false && h0.fcm.configured === false, JSON.stringify(h0));

  // ---------- C) Razón real del fallo APNs ----------
  console.log('- C · apnsFailureReason');
  const afr = push._internal && push._internal.apnsFailureReason;
  ok('apnsFailureReason existe', typeof afr === 'function');
  if (typeof afr === 'function') {
    ok('403 InvalidProviderToken -> apns_InvalidProviderToken', afr(403, '{"reason":"InvalidProviderToken"}') === 'apns_InvalidProviderToken', afr(403, '{"reason":"InvalidProviderToken"}'));
    ok('410 sin body -> apns_Unregistered', afr(410, '') === 'apns_Unregistered', afr(410, ''));
    ok('400 BadDeviceToken -> apns_BadDeviceToken', afr(400, '{"reason":"BadDeviceToken"}') === 'apns_BadDeviceToken', afr(400, '{"reason":"BadDeviceToken"}'));
    ok('sin respuesta -> apns_unreachable', afr(0, 'timeout') === 'apns_unreachable', afr(0, 'timeout'));
  }

  // ---------- D) sendPush fail-closed (regresión) ----------
  console.log('- D · sendPush fail-closed');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    keys_json TEXT NOT NULL DEFAULT '{}',
    transport TEXT NOT NULL DEFAULT 'webpush'
  )`);
  push.initPush(db);
  const r0 = await push.sendPush(1, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('sin suscripciones -> no_subs', r0 && r0.ok === false && r0.reason === 'no_subs', JSON.stringify(r0));
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport) VALUES (?,?,?,?)').run(1, 'a'.repeat(64), '{}', 'apns');
  const r1 = await push.sendPush(1, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('apns sin env -> apns_no_configurado (sin red)', r1 && r1.ok === false && r1.reason === 'apns_no_configurado', JSON.stringify(r1));
  const h2 = (typeof push.pushHealth === 'function') ? push.pushHealth() : null;
  ok('health cuenta la suscripción apns', !!h2 && h2.subs && h2.subs.total === 1 && h2.subs.apns === 1, JSON.stringify(h2 && h2.subs));

  // ---------- E) Wiring estático: endpoints admin + cliente ----------
  console.log('- E · wiring estático');
  const srvSrc = fs.readFileSync(SERVERJS, 'utf8');
  ok('GET /api/admin/push/health con requireAdminToken', srvSrc.includes("app.get('/api/admin/push/health', requireAdminToken"));
  ok('POST /api/admin/push/test con requireAdminToken', srvSrc.includes("app.post('/api/admin/push/test', requireAdminToken"));
  ok('push/test exige user_id (sin broadcast)', srvSrc.includes("user_id requerido"));
  const appSrc = fs.readFileSync(APPJS, 'utf8');
  ok('cliente: pzNativeBoot al arrancar (load)', appSrc.includes("pzNativeBoot()") && appSrc.includes("window.addEventListener('load'"));
  ok('cliente: listener registration -> pzNativeSaveToken', appSrc.includes("PN.addListener('registration'"));
  ok('cliente: reintento del pendiente al volver (visibilitychange)', appSrc.includes("pzNativeFlushPendiente") && appSrc.includes('visibilitychange'));
  ok('cliente: cola pz-native-token-pendiente intacta', appSrc.includes('pz-native-token-pendiente'));

  // ---------- G) Permiso iOS denied + registrationError visible ----------
  // Caso vivo 5/11 11:22-11:23: con el permiso en denied la app no puede
  // conseguir token nunca (iOS no vuelve a preguntar) y Ajustes solo
  // decía el genérico de no-token, sin decir dónde se arregla.
  console.log('- G · permiso denied + registrationError');
  const ajSrc = fs.readFileSync(AJUSTESJS, 'utf8');
  const fnSrc = (src, name) => {
    const i = src.indexOf('function ' + name);
    if (i < 0) return '';
    return src.slice(i, i + 4000);
  };
  ok('denied dice el camino exacto ES (Ajustes del iPhone → Posty → Notificaciones)', ajSrc.includes('Ajustes del iPhone → Posty → Notificaciones'));
  ok('denied dice el camino exacto EN (iPhone Settings → Posty → Notifications)', ajSrc.includes('iPhone Settings → Posty → Notifications'));
  const errTxt = fnSrc(ajSrc, 'pzPushErrTexto');
  // La rama no_token en sí (no la función entera) tiene que leer el error:
  // en prístino el det solo vivía en la rama genérica y no_token lo tragaba.
  const noTokBranch = errTxt.slice(errTxt.indexOf("r === 'no_token'"), errTxt.indexOf("r === 'pendiente'"));
  ok('no_token muestra el registrationError cuando iOS dejó uno', noTokBranch.indexOf("r === 'no_token'") >= 0 && noTokBranch.includes('PZ_NATIVE_LAST_ERROR'));
  ok('el botón no reintenta en silencio si denied (muestra la explicación)', ajSrc.includes("pzPushRowDenied()) { pzPushErrMostrar({ ok: false, reason: 'denied' })"));
  ok('Ajustes renderiza la explicación de denied desde el primer render', ajSrc.includes('ajPushOffTxt') && ajSrc.includes("pzPushRowDenied()) {") && ajSrc.includes('Cómo activarlas'));
  ok('pzNativeBoot escucha registrationError (PZ_NATIVE_LAST_ERROR)', appSrc.includes("PN.addListener('registrationError'") && appSrc.includes('PZ_NATIVE_LAST_ERROR'));
  const subSrc = fnSrc(appSrc, 'pzNativeSubscribe');
  ok('pzNativeSubscribe: denied vuelve sin llamar a register()', subSrc.includes("if (perm === 'denied')") && subSrc.indexOf("if (perm === 'denied')") < subSrc.indexOf('PN.register()'));
  const enSrc = fnSrc(appSrc, 'pzNativeEnableFlow');
  ok('pzNativeEnableFlow: denied vuelve antes de pedir permiso', enSrc.includes("pzNativePermState() === 'denied'") && enSrc.indexOf("pzNativePermState() === 'denied'") < enSrc.indexOf('pushAskCard'));
  ok('hint de push/test sin token: primero el permiso, después reinstalar', srvSrc.includes('Ajustes → Posty → Notificaciones') && srvSrc.includes('lote diagnóstico'));
  // (LOTE PUSH-FUNCIONANDO · hallazgo 11:26) Con el permiso GRANTED y sin
  // token, el loop devolvía no_token sin mirar el registrationError (p. ej.
  // sin entitlement aps-environment): ahora el error ES el motivo.
  ok("pzNativeSubscribe: registrationError -> reason 'registration_error', no no_token", subSrc.includes("reason: 'registration_error'") && subSrc.indexOf("reason: 'registration_error'") < subSrc.lastIndexOf("reason: 'no_token'"));
  ok('pzNativeSubscribe: borra el error de registro viejo antes de register()', subSrc.indexOf("PZ_NATIVE_REG_ERROR = ''") > 0 && subSrc.indexOf("PZ_NATIVE_REG_ERROR = ''") < subSrc.indexOf('PN.register()'));
  ok('pzNativeSubscribe: el bail mira REG_ERROR (no LAST_ERROR, que también pone un POST fallido)', subSrc.includes('if (PZ_NATIVE_REG_ERROR)'));
  ok('pzNativeBoot: el listener registrationError marca PZ_NATIVE_REG_ERROR', appSrc.includes('PZ_NATIVE_REG_ERROR = String(m)'));
  ok("pzPushErrTexto muestra el detalle para 'registration_error'", errTxt.includes('No se pudo activar: ') && errTxt.includes('PZ_NATIVE_LAST_ERROR'));
  ok('chunk-ajustes solo llama a globales que app.js define (pzPushRowDenied, pzNativePush)', appSrc.includes('function pzPushRowDenied') && appSrc.includes('function pzNativePush'));

  // ---------- F) Boot E2E: los endpoints responden ----------
  // SKIP_BOOT=1 lo salta (p. ej. para la pasada de discriminación contra
  // un árbol prístino sin node_modules).
  console.log('- F · boot E2E (servidor real, DATA_DIR temporal)');
  if (process.env.SKIP_BOOT === '1') {
    console.log('  (saltado por SKIP_BOOT=1)');
  } else {
  const dir = fs.mkdtempSync(path.join(TMPBASE, 'posta-pushfunc-'));
  const PORT = 4189;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env, DATA_DIR: dir, PORT: String(PORT), ADMIN_TOKEN: 'test-admin-token',
      APNS_KEY_P8: p8, APNS_KEY_ID: 'TESTKEYID1', APNS_TEAM_ID: 'TESTTEAM01',
      FCM_SERVICE_ACCOUNT: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  const base = `http://127.0.0.1:${PORT}`;
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); const j = await r.json(); if (j && /^2026\d{4}-v\d+$/.test(String(j.build || ''))) up = true; } catch (e) {}
      if (!up) await sleep(750);
    }
    ok('el servidor bootea y sirve su build', up);
    if (up) {
      const noTok = await fetch(base + '/api/admin/push/health');
      ok('health sin token -> 403', noTok.status === 403, 'status=' + noTok.status);
      const hRes = await fetch(base + '/api/admin/push/health?token=test-admin-token');
      const hJ = await hRes.json().catch(() => ({}));
      ok('health con token: APNs configured + keyParseable + 64B', hRes.status === 200 && hJ.ok === true && hJ.apns && hJ.apns.configured === true && hJ.apns.keyParseable === true && hJ.apns.signatureBytes === 64 && hJ.apns.host === 'api.push.apple.com', JSON.stringify(hJ.apns || hJ).slice(0, 300));
      ok('health: subs vacías en DB nueva', hJ.subs && hJ.subs.total === 0, JSON.stringify(hJ.subs));
      const tBad = await fetch(base + '/api/admin/push/test?token=test-admin-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      ok('push/test sin user_id -> 400', tBad.status === 400, 'status=' + tBad.status);
      const tRes = await fetch(base + '/api/admin/push/test?token=test-admin-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 1, title: 'Prueba', body: 'Hola' }),
      });
      const tJ = await tRes.json().catch(() => ({}));
      ok('push/test sin suscripciones -> no_subs (sin red) + hint claro', tRes.status === 200 && tJ.ok === false && tJ.reason === 'no_subs' && tJ.subs && tJ.subs.total === 0 && typeof tJ.hint === 'string' && tJ.hint.length > 20 && tJ.hint.includes('Notificaciones'), JSON.stringify(tJ).slice(0, 200));
    } else {
      console.error(bootLog.slice(-800));
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await sleep(500);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
  } // SKIP_BOOT

  console.log(`\nRESULTADO: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('ERROR test-lote-pushfuncionando:', e && e.message); process.exit(1); });
