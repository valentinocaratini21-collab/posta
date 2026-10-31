#!/usr/bin/env node
// test-push-nativo.js - Item 6: avisos en el telefono (push nativo).
// 1) Unidad REAL de push.js: router multi-transporte fail-closed sin env.
// 2) Unidad de las puras del cliente (extraidas de app.js y evaluadas).
// 3) Wiring estatico en app.js + invariantes (sin copy nuevo, sin precios).
// Uso: node test-push-nativo.js [app.js] [push.js]
//   Sin args: ./public/app.js y ./push.js (raiz del repo).
//   No toca red: sin env de FCM/APNs/VAPID, los envios retornan antes.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, extra !== undefined ? String(extra).slice(0, 200) : ''); }
};

const APPJS = path.resolve(process.argv[2] || path.join(__dirname, 'public', 'app.js'));
const PUSHJS = path.resolve(process.argv[3] || path.join(__dirname, 'push.js'));

// Sin credenciales en el proceso: los envios deben fallar cerrados, sin red.
for (const k of ['FCM_SERVICE_ACCOUNT', 'APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];

async function main() {
  // ---------- 1) push.js: router fail-closed ----------
  console.log('- push.js: router fail-closed');
  const push = require(PUSHJS);
  ok('TRANSPORTS incluye fcm y apns', Array.isArray(push.TRANSPORTS) && push.TRANSPORTS.includes('fcm') && push.TRANSPORTS.includes('apns'));
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    keys_json TEXT NOT NULL DEFAULT '{}',
    transport TEXT NOT NULL DEFAULT 'webpush'
  )`);
  push.initPush(db);
  const sub = (uid, endpoint, transport) => db.prepare(
    'INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport) VALUES (?,?,?,?)'
  ).run(uid, endpoint, '{}', transport);
  const r0 = await push.sendPush(1, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('sin suscripciones -> no_subs', r0 && r0.ok === false && r0.reason === 'no_subs', JSON.stringify(r0));
  sub(1, 'a'.repeat(64), 'apns');
  const r1 = await push.sendPush(1, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('apns sin env -> apns_no_configurado (sin red)', r1 && r1.ok === false && r1.reason === 'apns_no_configurado', JSON.stringify(r1));
  sub(2, 'fcm-token-' + 'x'.repeat(140), 'fcm');
  const r2 = await push.sendPush(2, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('fcm sin env -> fcm_no_configurado (sin red)', r2 && r2.ok === false && r2.reason === 'fcm_no_configurado', JSON.stringify(r2));
  sub(3, 'https://example.invalid/push/abc', 'webpush');
  const r3 = await push.sendPush(3, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('webpush sin VAPID -> no_vapid', r3 && r3.ok === false && r3.reason === 'no_vapid', JSON.stringify(r3));
  sub(4, 'b'.repeat(64), 'apns');
  sub(4, 'fcm-token-' + 'y'.repeat(140), 'fcm');
  const r4 = await push.sendPush(4, { title: 't', body: 'b', url: '/#/app/oficina' });
  ok('mixto fcm+apns sin env -> falla cerrada, 0 enviados', r4 && r4.ok === false && r4.reason === 'apns_no_configurado', JSON.stringify(r4));

  // ---------- 2) puras del cliente, extraidas de app.js ----------
  console.log('- cliente: puras extraidas de app.js');
  const src = fs.readFileSync(APPJS, 'utf8');
  const extract = (name) => {
    const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    return m ? m[0] : null;
  };
  const sRoute = extract('pzNativeRoute');
  const sToken = extract('pzNativeTokenOk');
  ok('pzNativeRoute extraida de app.js', !!sRoute);
  ok('pzNativeTokenOk extraida de app.js', !!sToken);
  const fns = new Function(sRoute + '\n' + sToken + '\nreturn { pzNativeRoute, pzNativeTokenOk };')();
  const R = fns.pzNativeRoute, T = fns.pzNativeTokenOk;
  ok('ruta: /#/app/oficina pasa tal cual', R('/#/app/oficina', true) === '#/app/oficina');
  ok('ruta: /#/app/post/123 pasa tal cual', R('/#/app/post/123', true) === '#/app/post/123');
  ok('ruta: #/app/semana pasa tal cual', R('#/app/semana', true) === '#/app/semana');
  ok('ruta: URL externa -> default shell', R('https://evil.example/x', true) === '#/app/oficina');
  ok('ruta: vacia -> default shell / web', R('', true) === '#/app/oficina' && R('', false) === '#/app/inicio');
  ok('ruta: con query -> default (sin inyeccion)', R('/#/app/semana?x=1', true) === '#/app/oficina');
  ok('token apns: 64 hex ok', T('apns', 'a'.repeat(64)) === true);
  ok('token apns: corto rechazado', T('apns', 'abc') === false);
  ok('token apns: no-hex rechazado', T('apns', 'g'.repeat(64)) === false);
  ok('token fcm: largo con :_- ok', T('fcm', 'dXJ:APA91b' + 'z'.repeat(140)) === true);
  ok('token fcm: corto rechazado', T('fcm', 'short') === false);
  ok('token fcm: con espacio rechazado', T('fcm', 'tiene espacio') === false);
  ok('token: transporte desconocido rechazado', T('webpush', 'x'.repeat(64)) === false);

  // ---------- 3) wiring estatico + invariantes ----------
  console.log('- wiring estatico en app.js');
  ok('rama nativa en pushDoSubscribe', src.includes('async function pushDoSubscribe() {\n  if (pzNativePush()) return pzNativeSubscribe();'));
  ok('rama nativa en pushEnableFlow', src.includes('async function pushEnableFlow() {\n  if (pzNativePush()) return pzNativeEnableFlow();'));
  ok('guarda nativa en maybeAskPushPostIg', src.includes('pzNativePermState() === \'denied\''));
  const idxDo = src.indexOf('async function doLogout()');
  const idxBind = src.indexOf('function bindApp(');
  const idxTok = idxDo > -1 ? src.indexOf("localStorage.getItem('pz-native-token')", idxDo) : -1;
  ok('baja del token nativo dentro de doLogout', idxDo > -1 && idxBind > idxDo && idxTok > idxDo && idxTok < idxBind);
  ok('boot: listener de tap registrado', src.includes('pushNotificationActionPerformed') && src.includes('pzNativeRoute(d.url, true)'));
  ok('boot: pzNativeBoot en load', src.includes('pzNativeBoot()'));
  ok('suscripcion nativa: transport + token al endpoint existente', src.includes("api.post('/api/push/subscribe', { transport: transport, token:"));
  ok('pushAskCard sigue siendo unica (sin tarjeta nueva)', (src.match(/function pushAskCard\(\)/g) || []).length === 1);
  const bi = src.indexOf('/* PZ-NATIVE-PUSH */');
  const bj = src.indexOf('function postyNotify', bi);
  const block = (bi > -1 && bj > bi) ? src.slice(bi, bj) : '';
  ok('bloque nativo: sin modal nuevo', block && !block.includes('pz-exp-modal'));
  ok('bloque nativo: sin innerHTML (sin UI nueva)', block && !block.includes('innerHTML'));
  ok('bloque nativo: sin precios', block && !block.includes('199') && !block.includes('299') && !block.includes('399'));

  console.log('test-push-nativo: ' + passed + '/' + (passed + failed));
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('ERROR test-push-nativo:', e && e.message); process.exit(1); });
