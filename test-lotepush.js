// test-lotepush.js — LOTE PUSH EN MARCHA.
// Corre: node test-lotepush.js  (desde la raíz del repo, sin node_modules:
// solo usa push.js y upcoming-notice.js, ambos sin dependencias externas).
// Cero envíos reales: sin VAPID/APNs/FCM en el entorno, todos los envíos
// fallan fail-closed antes de tocar la red; la cascada se prueba con
// funciones inyectadas (el mismo patrón opts.pushFn/opts.emailFn del módulo).
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const push = require(path.join(ROOT, 'push.js'));
const upcoming = require(path.join(ROOT, 'upcoming-notice.js'));

let n = 0;
function ok(cond, label) {
  n++;
  assert.ok(cond, label);
  console.log('ok ' + n + ' - ' + label);
}

// ---------- entorno: sin credenciales reales, siempre ----------
const ENV_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_KEY_P8',
  'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_SANDBOX', 'FCM_SERVICE_ACCOUNT'];
const SAVED_ENV = {};
for (const k of ENV_KEYS) { SAVED_ENV[k] = process.env[k]; delete process.env[k]; }
function restoreEnv() { for (const k of ENV_KEYS) { if (SAVED_ENV[k] === undefined) delete process.env[k]; else process.env[k] = SAVED_ENV[k]; } }

// ---------- DB falsa ----------
function fakeDb(opts) {
  opts = opts || {};
  const rec = { updates: [], events: [], chats: [] };
  return {
    rec,
    prepare(sql) {
      if (/PRAGMA table_info\(push_subscriptions\)/.test(sql)) {
        return { all: () => [{ name: 'transport' }], get: () => undefined, run: () => ({}) };
      }
      if (/FROM push_subscriptions WHERE user_id/.test(sql)) {
        return { all: () => (opts.subs || []), get: () => undefined, run: () => ({}) };
      }
      if (/FROM users WHERE id/.test(sql)) {
        return { all: () => [], get: () => (opts.userRow || {}), run: () => ({}) };
      }
      if (/post_failed_push/.test(sql)) {
        return { all: () => [], get: () => ({ c: opts.failedPushCount || 0 }), run: () => ({}) };
      }
      if (/post_failed/.test(sql) && /COUNT/.test(sql)) {
        return { all: () => [], get: () => ({ c: 0 }), run: () => ({}) };
      }
      if (/UPDATE posts SET autopilot_notified/.test(sql)) {
        return { all: () => [], get: () => undefined, run: (id) => { rec.updates.push(id); } };
      }
      if (/INSERT INTO events/.test(sql)) {
        return { all: () => [], get: () => undefined, run: (uid, sid, name, props) => { rec.events.push({ name, props }); } };
      }
      if (/INSERT INTO chat_messages/.test(sql)) {
        return { all: () => [], get: () => undefined, run: (uid, role, text) => { rec.chats.push(text); } };
      }
      return { all: () => [], get: () => ({}), run: () => ({}) };
    },
    exec() {},
  };
}

(async () => {
  // ---------- A. push.js: fail-closed, sin red ----------
  // Sin initPush: no_db (tiene que correr antes de cualquier initPush).
  let r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'no_db', 'A1 sin initPush -> no_db');

  const sub = (transport, endpoint) => ({ id: 1, endpoint, keys_json: '{}', transport });
  push.initPush(fakeDb({ subs: [] }));
  r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'no_subs', 'A2 sin suscripciones -> no_subs');

  push.initPush(fakeDb({ subs: [sub('webpush', 'https://example.invalid/push/1')] }));
  r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'no_vapid', 'A3 webpush sin VAPID -> no_vapid (antes de tocar la red)');

  push.initPush(fakeDb({ subs: [sub('apns', 'aa'.repeat(32))] }));
  r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'apns_no_configurado', 'A4 apns sin envs -> apns_no_configurado');

  push.initPush(fakeDb({ subs: [sub('fcm', 'fcm-token-de-prueba')] }));
  r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'fcm_no_configurado', 'A5 fcm sin service account -> fcm_no_configurado');

  push.initPush(fakeDb({ subs: [sub('webpush', 'https://example.invalid/push/1'), sub('apns', 'bb'.repeat(32))] }));
  r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'apns_no_configurado', 'A6 mixto sin configs -> falla fail-closed (último transporte da la razón)');

  const throwingDb = { prepare() { throw new Error('boom'); }, exec() {} };
  push.initPush(throwingDb);
  r = await push.sendPush(1, { title: 't', body: 'b', url: '/' });
  ok(r && r.ok === false && r.reason === 'no_table', 'A7 DB que tira -> no_table, nunca excepción');

  // ---------- B. _internal: config APNs/FCM sin red ----------
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const p8pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.APNS_KEY_P8 = p8pem;
  process.env.APNS_KEY_ID = 'TESTKEY123';
  process.env.APNS_TEAM_ID = 'TESTTEAM99';
  let cfg = push._internal.apnsConfig();
  ok(cfg && cfg.bundleId === 'com.postycommunitymanager.app', 'B1 default APNs = appId real del shell (no el viejo postyhacetodo)');
  ok(cfg && cfg.host === 'api.push.apple.com', 'B2 APNs producción por defecto');
  process.env.APNS_SANDBOX = '1';
  ok(push._internal.apnsConfig().host === 'api.sandbox.push.apple.com', 'B3 APNS_SANDBOX=1 -> sandbox');
  delete process.env.APNS_SANDBOX;
  process.env.APNS_BUNDLE_ID = 'com.ejemplo.app';
  ok(push._internal.apnsConfig().bundleId === 'com.ejemplo.app', 'B4 APNS_BUNDLE_ID env sigue ganando al default');
  delete process.env.APNS_BUNDLE_ID;
  process.env.APNS_KEY_P8 = p8pem.replace(/\n/g, '\\n'); // forma con \n literales, como viaja en env
  cfg = push._internal.apnsConfig();
  ok(cfg && cfg.p8.indexOf('\\n') === -1 && cfg.p8.indexOf('\n') !== -1, 'B5 P8 con \\n literales se restaura a saltos reales');
  const tok = push._internal.apnsProviderToken(cfg);
  const parts = String(tok).split('.');
  ok(parts.length === 3, 'B6 provider token APNs tiene 3 partes (firma offline, sin red)');
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
  ok(header.alg === 'ES256' && header.kid === 'TESTKEY123', 'B7 header del token: ES256 + kid del env');
  delete process.env.APNS_KEY_P8; delete process.env.APNS_KEY_ID; delete process.env.APNS_TEAM_ID;
  ok(push._internal.apnsConfig() === null, 'B8 sin envs APNs -> config null');

  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p', private_key: 'k', client_email: 'c@p.iam.gserviceaccount.com' });
  const sa = push._internal.fcmServiceAccount();
  ok(sa && sa.project_id === 'p', 'B9 FCM service account válido se parsea');
  process.env.FCM_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'p' });
  ok(push._internal.fcmServiceAccount() === null, 'B10 FCM sin private_key/client_email -> null');
  process.env.FCM_SERVICE_ACCOUNT = 'no-json';
  ok(push._internal.fcmServiceAccount() === null, 'B11 FCM JSON inválido -> null');
  delete process.env.FCM_SERVICE_ACCOUNT;

  // ---------- C. avisos con toggles (sin envío) ----------
  let sendCalls = 0;
  const sendFn = async () => { sendCalls++; return { ok: true, sent: 1 }; };
  let db = fakeDb({ userRow: { notify_letter: 0, notify_failed: 1, lang: 'es' } });
  r = await push.notifySundayLetter(7, { db, sendFn });
  ok(r && r.reason === 'opted_out' && sendCalls === 0, 'C1 carta con notify_letter=0 -> opted_out sin enviar');
  db = fakeDb({ userRow: { notify_letter: 1, notify_failed: 1, lang: 'es' }, failedPushCount: 1 });
  r = await push.notifyPostFailed(7, { db, sendFn });
  ok(r && r.reason === 'throttled', 'C2 post fallido con push reciente (30m) -> throttled');

  // ---------- D. cascada 30 min (upcoming-notice, fns inyectadas) ----------
  const postBase = { id: 101, user_id: 7, caption: 'Mi posteo de prueba\nsegunda línea', approval: 'pending', auto_published: 0, owner_liked: 0, needs_review: 0, scheduled_at: '2030-01-01T00:00:00Z' };
  const userAuto = { trust_level: 1, autopilot_prenotify: 1, email: 'x@y.z', lang: 'es' };
  async function runCascade(post, user, pushRes, emailRes) {
    const fdb = fakeDb({ userRow: user });
    let emailCalls = 0;
    const out = await upcoming.processUpcomingNotices(fdb, {
      posts: [post],
      pushFn: async () => pushRes,
      emailFn: async () => { emailCalls++; return emailRes; },
    });
    return { out, fdb, emailCalls };
  }
  let c = await runCascade({ ...postBase }, userAuto, { ok: true, sent: 1 }, { ok: true });
  ok(c.out.push === 1 && c.out.detalle[0].channel === 'push' && c.out.detalle[0].mode === 'autopilot', 'D1 push ok -> canal push, modo autopilot');
  ok(c.emailCalls === 0, 'D2 push ok -> el email NO se llama (sin duplicado)');
  ok(c.fdb.rec.updates.indexOf(101) !== -1, 'D3 push ok -> posteo marcado (un solo aviso)');
  c = await runCascade({ ...postBase }, userAuto, { ok: false, reason: 'no_subs' }, { ok: true });
  ok(c.out.email === 1 && c.out.detalle[0].channel === 'email' && c.out.detalle[0].push_reason === 'no_subs', 'D4 push no_subs + email ok -> canal email con push_reason honesto');
  c = await runCascade({ ...postBase }, userAuto, { ok: false, reason: 'no_subs' }, { ok: false, reason: 'no_config' });
  ok(c.out.chat === 1 && c.out.detalle[0].channel === 'chat' && c.fdb.rec.chats.length === 1, 'D5 sin push ni email -> aviso en chat, marcado');
  ok(c.fdb.rec.chats[0].indexOf('Mi posteo de prueba') !== -1, 'D6 el chat lleva la primera línea del caption');
  c = await runCascade({ ...postBase }, userAuto, { ok: false, reason: 'no_subs' }, { ok: false, reason: 'send_failed', transient: true });
  ok(c.out.retried === 1 && c.fdb.rec.updates.indexOf(101) === -1, 'D7 email transitorio -> reintento, NO marcado (no se disfraza)');
  c = await runCascade({ ...postBase, approval: 'approved' }, userAuto, { ok: true }, { ok: true });
  ok(c.out.ineligible === 1 && c.out.push === 0 && c.out.email === 0, 'D8 posteo aprobado -> inelegible (lote aviso: confirmado no se avisa)');
  c = await runCascade({ ...postBase, owner_liked: 1 }, userAuto, { ok: true }, { ok: true });
  ok(c.out.ineligible === 1, 'D9 corazón tocado -> inelegible (suprime el aviso, no aprueba)');
  c = await runCascade({ ...postBase }, { trust_level: 0, autopilot_prenotify: 0, email: 'x@y.z', lang: 'es' }, { ok: true }, { ok: true });
  ok(c.out.detalle[0].mode === 'manual', 'D10 trust 0 + pending -> modo manual');
  ok(upcoming._internal.eligible(null, { ...postBase, approval: 'auto' }, userAuto) === false, 'D11 eligible directo: auto -> false');
  ok(upcoming._internal.eligible(null, { ...postBase }, userAuto) === true, 'D12 eligible directo: trust 1 + pending -> true');

  // ---------- E. estático: el cambio del lote ----------
  const pushSrc = fs.readFileSync(path.join(ROOT, 'push.js'), 'utf8');
  ok(pushSrc.indexOf('com.postycommunitymanager.app') !== -1, 'E1 push.js trae el bundle real');
  ok(pushSrc.indexOf('com.postyhacetodo.app') === -1, 'E2 push.js ya no menciona el bundle viejo en ningún lado');
  const chunkSrc = fs.readFileSync(path.join(ROOT, 'public', 'chunk-ajustes.js'), 'utf8');
  ok(chunkSrc.indexOf('id="btnPushEnable"') !== -1, 'E3 Ajustes tiene el botón Activar notificaciones');
  ok(chunkSrc.indexOf('Todavía no activaste las notificaciones en tu celu') !== -1, 'E4 el texto del hint sigue intacto');
  ok(chunkSrc.indexOf('btnPushEnable') !== -1 && chunkSrc.indexOf('pushEnableFlow()') !== -1 && chunkSrc.indexOf('await loadNotifyPrefs()') !== -1, 'E5 el botón llama a pushEnableFlow y re-carga los prefs al lograrlo');
  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  ok((appSrc.match(/function pushEnableFlow/g) || []).length === 1, 'E6 pushEnableFlow definida una sola vez en app.js (M78: el botón llama a función existente)');

  restoreEnv();
  console.log('LOTE-PUSH: ' + n + '/' + n + ' asserts en verde');
})().catch((e) => { restoreEnv(); console.error('FALLO:', e && e.message); process.exit(1); });
