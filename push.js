// push.js — Push notifications multi-transporte.
// Transporte 'webpush' (VAPID) = flujo original, intacto.
// Transporte 'fcm'   = apps Android nativas (Capacitor/TWA) — tokens FCM.
// Transporte 'apns'  = apps iOS nativas (Capacitor) — device tokens APNs.
//
// Contrato (Fase 2 Tiendas):
//   - sendPush(userId, { title, body, url, image }) rutea por transport.
//   - 'fcm'  sin env FCM_SERVICE_ACCOUNT          → { ok:false, reason:'fcm_no_configurado' }
//   - 'apns' sin envs APNS_KEY_P8/KEY_ID/TEAM_ID  → { ok:false, reason:'apns_no_configurado' }
//   - Sin suscripciones                            → { ok:false, reason:'no_subs' }
//   - Sin VAPID (solo aplica a webpush)            → { ok:false, reason:'no_vapid' }
//   - NUNCA tira excepciones.
//   - Las suscripciones fcm/apns guardan endpoint=token, keys_json='{}'.
//
// Sin dependencias nuevas: FCM usa OAuth2 con JWT firmado a mano (node:crypto),
// APNs usa HTTP/2 (node:http2) con provider token ES256 firmado a mano.
'use strict';

const crypto = require('crypto');
const https = require('https');
const http2 = require('http2');

let DB = null;

// ---------- Migración tolerante (Fase 2): columna transport ----------
// Se corre en initPush (arranque del server) y también desde el endpoint de
// suscripción por las dudas. Si la columna ya existe, no hace nada.
function ensureTransportColumn(db) {
  const target = db || DB;
  if (!target) return false;
  try {
    const cols = target.prepare(`PRAGMA table_info(push_subscriptions)`).all();
    if (Array.isArray(cols) && cols.some(c => c.name === 'transport')) return true;
    target.exec(`ALTER TABLE push_subscriptions ADD COLUMN transport TEXT NOT NULL DEFAULT 'webpush'`);
    return true;
  } catch (e) { return false; /* ya existe o no hay tabla todavía */ }
}

function initPush(db) {
  DB = db;
  ensureTransportColumn(db);
}

// ---------- Web Push / VAPID (flujo original — NO TOCAR) ----------
let webpush = null;
function vapidKeys() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  return (pub && priv) ? { pub, priv } : null;
}
function vapidPublicKey() {
  const v = vapidKeys();
  return v ? v.pub : '';
}
function pushConfigured() { return !!vapidKeys(); }

function getWebPush() {
  if (webpush) return webpush;
  const v = vapidKeys();
  if (!v) return null;
  try {
    webpush = require('web-push');
    webpush.setVapidDetails('mailto:hola@postyhacetodo.com', v.pub, v.priv);
  } catch (e) {
    console.error('[push] no se pudo inicializar web-push:', e.message);
    return null;
  }
  return webpush;
}

// ---------- FCM HTTP v1 (apps Android nativas) ----------
// Env FCM_SERVICE_ACCOUNT = JSON del service account de Firebase
// { type, project_id, private_key, client_email, token_uri }.
let fcmTokenCache = { token: '', exp: 0 };
function fcmServiceAccount() {
  try {
    const raw = (process.env.FCM_SERVICE_ACCOUNT || '').trim();
    if (!raw) return null;
    const sa = JSON.parse(raw);
    if (!sa || !sa.private_key || !sa.client_email || !sa.project_id) return null;
    return sa;
  } catch (e) { return null; }
}
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function postJson(urlStr, headers, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers || {}),
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 15000, () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}
async function fcmAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (fcmTokenCache.token && fcmTokenCache.exp > now + 60) return fcmTokenCache.token;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  const sig = base64url(signer.sign(sa.private_key));
  const assertion = header + '.' + claims + '.' + sig;
  // token endpoint: form-urlencoded
  const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')
    + '&assertion=' + encodeURIComponent(assertion);
  const resp = await new Promise((resolve, reject) => {
    const u = new URL(sa.token_uri || 'https://oauth2.googleapis.com/token');
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
  if (resp.status !== 200) throw new Error('oauth falló: ' + resp.status);
  let parsed = {};
  try { parsed = JSON.parse(resp.body); } catch (e) { throw new Error('oauth respuesta inválida'); }
  if (!parsed.access_token) throw new Error('oauth sin access_token');
  fcmTokenCache = { token: parsed.access_token, exp: now + 3300 };
  return fcmTokenCache.token;
}
async function sendFcmBatch(subs, msg) {
  const sa = fcmServiceAccount();
  if (!sa) return { ok: false, reason: 'fcm_no_configurado', sent: 0 };
  let access;
  try { access = await fcmAccessToken(sa); }
  catch (e) { console.error('[push/fcm] no se pudo obtener token:', e.message); return { ok: false, reason: 'fcm_no_configurado', sent: 0 }; }
  const sendUrl = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(sa.project_id) + '/messages:send';
  const fullUrl = /^https?:\/\//i.test(msg.url) ? msg.url : 'https://postyhacetodo.com' + msg.url;
  let sent = 0;
  for (const s of subs) {
    try {
      const message = {
        message: {
          token: s.endpoint,
          notification: { title: msg.title, body: msg.body || '' },
          data: { url: msg.url, postId: String(msg.data.postId || '') },
          android: { priority: 'high', notification: { click_action: 'OPEN_URL' } },
          webpush: { fcm_options: { link: fullUrl } },
        },
      };
      if (msg.actions.length) message.message.data.actions = JSON.stringify(msg.actions);
      if (msg.image) message.message.notification.image = msg.image;
      const r = await postJson(sendUrl, { Authorization: 'Bearer ' + access }, message);
      if (r.status === 200 || r.status === 201) { sent++; continue; }
      // Token muerto (no registrado / inválido): limpiarlo.
      let code = '';
      try { code = ((JSON.parse(r.body || '{}').error || {}).details || []).map(d => d.errorCode).join(','); } catch (e) {}
      if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(code + ' ' + (r.body || ''))) {
        try { if (DB) DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); } catch (e2) { /* no bloquear */ }
      } else {
        console.error('[push/fcm] envío falló:', r.status, (r.body || '').slice(0, 200));
      }
    } catch (e) {
      console.error('[push/fcm] envío falló:', e.message);
    }
  }
  return { ok: sent > 0, sent };
}

// ---------- APNs (apps iOS nativas, HTTP/2) ----------
// Envs: APNS_KEY_P8 (contenido .pem, admite \n literales), APNS_KEY_ID,
// APNS_TEAM_ID. Opcionales: APNS_BUNDLE_ID (default com.postyhacetodo.app),
// APNS_SANDBOX=1 (dev).
let apnsTokenCache = { token: '', exp: 0 };
function apnsConfig() {
  const p8 = (process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n');
  const keyId = (process.env.APNS_KEY_ID || '').trim();
  const teamId = (process.env.APNS_TEAM_ID || '').trim();
  if (!p8 || !keyId || !teamId) return null;
  return {
    p8, keyId, teamId,
    bundleId: (process.env.APNS_BUNDLE_ID || 'com.postyhacetodo.app').trim(),
    host: (process.env.APNS_SANDBOX === '1') ? 'api.sandbox.push.apple.com' : 'api.push.apple.com',
  };
}
function apnsProviderToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  if (apnsTokenCache.token && apnsTokenCache.exp > now + 60) return apnsTokenCache.token;
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = base64url(JSON.stringify({ iss: cfg.teamId, iat: now }));
  const signer = crypto.createSign('sha256');
  signer.update(header + '.' + claims);
  const sig = base64url(signer.sign({ key: cfg.p8, format: 'pem' }));
  apnsTokenCache = { token: header + '.' + claims + '.' + sig, exp: now + 3000 };
  return apnsTokenCache.token;
}
function apnsSendOne(cfg, providerToken, deviceToken, msg) {
  return new Promise((resolve) => {
    let client;
    try { client = http2.connect('https://' + cfg.host); }
    catch (e) { return resolve({ status: 0, body: e.message }); }
    const payload = {
      aps: { alert: { title: msg.title, body: msg.body || '' }, sound: 'default', 'mutable-content': 1 },
      url: msg.url,
      postId: String(msg.data.postId || ''),
    };
    if (msg.image) payload.image = msg.image;
    const body = JSON.stringify(payload);
    const req = client.request({
      ':method': 'POST',
      ':path': '/3/device/' + deviceToken,
      'authorization': 'bearer ' + providerToken,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-length': Buffer.byteLength(body),
    });
    let data = '';
    let status = 0;
    req.on('response', (headers) => { status = headers[':status'] || 0; });
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { client.close(); } catch (e) {} resolve({ status, body: data }); });
    req.on('error', (e) => { try { client.close(); } catch (e2) {} resolve({ status: 0, body: e.message }); });
    req.setTimeout(15000, () => { try { req.close(); } catch (e) {} try { client.close(); } catch (e2) {} resolve({ status: 0, body: 'timeout' }); });
    req.write(body);
    req.end();
  });
}
async function sendApnsBatch(subs, msg) {
  const cfg = apnsConfig();
  if (!cfg) return { ok: false, reason: 'apns_no_configurado', sent: 0 };
  let providerToken;
  try { providerToken = apnsProviderToken(cfg); }
  catch (e) { console.error('[push/apns] no se pudo firmar el provider token:', e.message); return { ok: false, reason: 'apns_no_configurado', sent: 0 }; }
  let sent = 0;
  for (const s of subs) {
    try {
      const r = await apnsSendOne(cfg, providerToken, s.endpoint, msg);
      if (r.status === 200) { sent++; continue; }
      // 410 = token muerto (app desinstalada): limpiarlo.
      if (r.status === 410 || /Unregistered|BadDeviceToken/i.test(r.body || '')) {
        try { if (DB) DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); } catch (e2) { /* no bloquear */ }
      } else {
        console.error('[push/apns] envío falló:', r.status, (r.body || '').slice(0, 200));
      }
    } catch (e) {
      console.error('[push/apns] envío falló:', e.message);
    }
  }
  return { ok: sent > 0, sent };
}

// ---------- Envío principal: rutea por transport ----------
// Envía una push a TODOS los dispositivos suscriptos del usuario.
// Nunca tira: devuelve { ok:true, sent } o { ok:false, reason }.
// Reasons: 'no_db' | 'no_table' | 'no_subs' | 'no_vapid' |
//          'fcm_no_configurado' | 'apns_no_configurado' | 'send_failed'
// Extendido (Posty te avisa): acepta image (URL absoluta), actions
// (botones de la notificación web) y data (se mergea en notification.data).
// Los llamados viejos con { title, body, url } siguen andando igual.
async function sendPush(userId, { title, body, url, image, actions, data } = {}) {
  if (!DB) return { ok: false, reason: 'no_db' };
  let subs = [];
  try {
    ensureTransportColumn(DB);
    subs = DB.prepare('SELECT id, endpoint, keys_json, transport FROM push_subscriptions WHERE user_id = ?').all(userId);
  } catch (e) {
    return { ok: false, reason: 'no_table' };
  }
  if (!subs.length) return { ok: false, reason: 'no_subs' };
  const msg = {
    title: String(title || 'Posty 💬'),
    body: String(body || ''),
    url: String(url || '/#/app/semana'),
    image: image ? String(image) : '',
    actions: Array.isArray(actions) ? actions.filter((a) => a && a.action && a.title).map((a) => ({ action: String(a.action), title: String(a.title) })) : [],
    data: (data && typeof data === 'object' && !Array.isArray(data)) ? data : {},
  };
  const byTransport = (t) => subs.filter((s) => (s.transport || 'webpush') === t);
  const webSubs = byTransport('webpush');
  const fcmSubs = byTransport('fcm');
  const apnsSubs = byTransport('apns');
  const firstReason = { value: 'send_failed' };
  let sent = 0;

  // --- webpush: flujo original, intacto ---
  if (webSubs.length) {
    const wp = getWebPush();
    if (!wp) {
      firstReason.value = 'no_vapid';
    } else {
      const payload = JSON.stringify({
        title: msg.title, body: msg.body, url: msg.url,
        image: msg.image || undefined,
        actions: msg.actions.length ? msg.actions : undefined,
        data: Object.keys(msg.data).length ? msg.data : undefined,
      });
      for (const s of webSubs) {
        try {
          let keys = {};
          try { keys = JSON.parse(s.keys_json || '{}'); } catch (e) { /* keys inválidas: igual intentar */ }
          await wp.sendNotification({ endpoint: s.endpoint, keys }, payload);
          sent++;
        } catch (e) {
          // 410/404 = suscripción muerta (desinstaló, revocó): limpiarla.
          if (e && (e.statusCode === 410 || e.statusCode === 404)) {
            try { DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); } catch (e2) { /* no bloquear */ }
          } else {
            console.error('[push] envío falló:', e && e.message);
          }
        }
      }
    }
  }

  // --- fcm (apps Android nativas) ---
  if (fcmSubs.length) {
    try {
      const r = await sendFcmBatch(fcmSubs, msg);
      sent += (r.sent || 0);
      if (!r.ok && sent === 0) firstReason.value = r.reason || 'fcm_no_configurado';
    } catch (e) {
      console.error('[push/fcm] batch falló:', e.message);
      if (sent === 0) firstReason.value = 'fcm_no_configurado';
    }
  }

  // --- apns (apps iOS nativas) ---
  if (apnsSubs.length) {
    try {
      const r = await sendApnsBatch(apnsSubs, msg);
      sent += (r.sent || 0);
      if (!r.ok && sent === 0) firstReason.value = r.reason || 'apns_no_configurado';
    } catch (e) {
      console.error('[push/apns] batch falló:', e.message);
      if (sent === 0) firstReason.value = 'apns_no_configurado';
    }
  }

  if (sent > 0) return { ok: true, sent };
  return { ok: false, reason: firstReason.value };
}

module.exports = {
  initPush,
  sendPush,
  vapidPublicKey,
  pushConfigured,
  ensureTransportColumn,
  TRANSPORTS: ['webpush', 'fcm', 'apns'],
};
