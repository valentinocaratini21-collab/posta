'use strict';
// Tests del flujo WhatsApp-aprobación (tanda whatsapp-aprobacion).
// Corren con: node test-whatsapp-aprobacion.js
// Sin red real: fetch va stubbeado; DB real en memoria (node:sqlite).
// El gate se prueba con env explícito (el módulo nunca lee process.env en
// los tests: todas las funciones aceptan env/opts).
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const wa = require('./server/whatsapp.js');

const ENV_ON = {
  WHATSAPP_TOKEN: 'test-token',
  WHATSAPP_PHONE_NUMBER_ID: '12345',
  WHATSAPP_VERIFY_TOKEN: 'verify-me',
  WHATSAPP_APP_SECRET: 'appsecret',
};
const ENV_OFF = {};

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, created_at TEXT, lang TEXT);
           CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT);`);
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (1, ?, ?, ?)').run('a@b.c', 'x', '2026-01-01');
  db.prepare('INSERT INTO profiles (user_id, business_name) VALUES (1, ?)').run('Café Aroma');
  return db;
}

function stubFetch(capture, okPayload) {
  return async (url, opts) => {
    capture.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization });
    return { ok: true, json: async () => okPayload || { messages: [{ id: 'wamid.123' }] } };
  };
}

let pass = 0;
let total = 0;
async function t(name, fn) {
  total++;
  try { await fn(); pass++; console.log('  ok - ' + name); }
  catch (e) { console.log('  FAIL - ' + name + ': ' + e.message); process.exitCode = 1; }
}

(async () => {
  console.log('test-whatsapp-aprobacion');
  await t('gate: apagado sin credenciales, encendido con token+phone', () => {
    assert.strictEqual(wa.enabled(ENV_OFF), false);
    assert.strictEqual(wa.enabled(ENV_ON), true);
    assert.strictEqual(wa.enabled({ WHATSAPP_TOKEN: 'x' }), false);
  });
  await t('normalize: dígitos, formato con +/espacios, inválidos', () => {
    assert.strictEqual(wa.normalizeWaNumber('5491123456789'), '5491123456789');
    assert.strictEqual(wa.normalizeWaNumber('+54 9 11 2345-6789'), '5491123456789');
    assert.strictEqual(wa.normalizeWaNumber('abc'), null);
    assert.strictEqual(wa.normalizeWaNumber('123'), null);
    assert.strictEqual(wa.normalizeWaNumber('1234567890123456'), null);
    assert.strictEqual(wa.maskNumber('5491123456789'), '••••••6789');
  });
  await t('opt-in: on/off, número solo no cambia consentimiento, errores', () => {
    const db = freshDb();
    let r = wa.applyNotifyPrefs(db, 1, { wa_notify_num: '5491123456789', wa_notify_optin: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.wa.opted_in, true);
    assert.strictEqual(r.wa.number_masked, '••••••6789');
    r = wa.applyNotifyPrefs(db, 1, { wa_notify_num: '5491100000000' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.wa.opted_in, true); // el número solo no apaga el permiso
    r = wa.applyNotifyPrefs(db, 1, { wa_notify_optin: false });
    assert.strictEqual(r.wa.opted_in, false);
    r = wa.applyNotifyPrefs(db, 1, { wa_notify_num: 'nope', wa_notify_optin: true });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'wa_number_invalid');
    const db2 = freshDb();
    r = wa.applyNotifyPrefs(db2, 1, { wa_notify_optin: true });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'wa_number_required');
  });
  await t('isSendable: optout posterior apaga, optin posterior reenciende', () => {
    const db = freshDb();
    wa.applyNotifyPrefs(db, 1, { wa_notify_num: '5491123456789', wa_notify_optin: true });
    const row1 = db.prepare('SELECT wa_notify_num, wa_notify_optin_at, wa_notify_optout_at FROM users WHERE id = 1').get();
    assert.strictEqual(wa.isSendable(row1), true);
    wa.applyNotifyPrefs(db, 1, { wa_notify_optin: false });
    const row2 = db.prepare('SELECT wa_notify_num, wa_notify_optin_at, wa_notify_optout_at FROM users WHERE id = 1').get();
    assert.strictEqual(wa.isSendable(row2), false);
    wa.applyNotifyPrefs(db, 1, { wa_notify_optin: true }); // reusa el número guardado
    const row3 = db.prepare('SELECT wa_notify_num, wa_notify_optin_at, wa_notify_optout_at FROM users WHERE id = 1').get();
    assert.strictEqual(wa.isSendable(row3), true);
  });
  await t('sendTemplate gate off: no llama a fetch', async () => {
    const db = freshDb();
    const cap = [];
    const r = await wa.sendTemplate(db, { to: '5491123456789', lang: 'es', name: 'Café Aroma', token: 'TOK' }, { env: ENV_OFF, fetchImpl: stubFetch(cap) });
    assert.strictEqual(r.skipped, 'disabled');
    assert.strictEqual(cap.length, 0);
  });
  await t('sendTemplate gate on: URL, plantilla, idioma, componentes; log sent', async () => {
    const db = freshDb();
    wa.ensureSchema(db);
    const cap = [];
    const r = await wa.sendTemplate(db, { userId: 1, to: '5491123456789', lang: 'es', name: 'Café Aroma', token: 'TOK123' }, { env: ENV_ON, fetchImpl: stubFetch(cap) });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.messageId, 'wamid.123');
    assert.strictEqual(cap.length, 1);
    assert.ok(cap[0].url.includes('/12345/messages'), 'url lleva el phone_number_id');
    assert.strictEqual(cap[0].auth, 'Bearer test-token');
    assert.strictEqual(cap[0].body.template.name, 'carta_semanal');
    assert.strictEqual(cap[0].body.template.language.code, 'es_AR');
    assert.strictEqual(cap[0].body.template.components[0].parameters[0].text, 'Café Aroma');
    assert.strictEqual(cap[0].body.template.components[1].parameters[0].text, 'TOK123');
    assert.strictEqual(cap[0].body.template.components[1].sub_type, 'url');
    const log = db.prepare('SELECT status, provider_id FROM whatsapp_send_log ORDER BY id DESC LIMIT 1').get();
    assert.strictEqual(log.status, 'sent');
    assert.strictEqual(log.provider_id, 'wamid.123');
  });
  await t('sendTemplate error de Graph: ok false y log failed', async () => {
    const db = freshDb();
    wa.ensureSchema(db);
    const fetchFail = async () => ({ ok: false, json: async () => ({ error: { message: 'template not found' } }) });
    const r = await wa.sendTemplate(db, { userId: 1, to: '5491123456789', lang: 'en', name: 'friend', token: 'TOK' }, { env: ENV_ON, fetchImpl: fetchFail });
    assert.strictEqual(r.ok, false);
    const log = db.prepare('SELECT status, template FROM whatsapp_send_log ORDER BY id DESC LIMIT 1').get();
    assert.strictEqual(log.status, 'failed');
    assert.strictEqual(log.template, 'carta_semanal_en');
  });
  await t('notifySundayLetter: flujo completo, sin opt-in, sin semana, gate off', async () => {
    const db = freshDb();
    wa.applyNotifyPrefs(db, 1, { wa_notify_num: '5491123456789', wa_notify_optin: true });
    const cap = [];
    let r = await wa.notifySundayLetter(db, 1, { approveUrl: '/aprobar/TOK123', weekKey: '2026-10-26', env: ENV_ON, fetchImpl: stubFetch(cap) });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(cap[0].body.template.components[1].parameters[0].text, 'TOK123');
    assert.strictEqual(cap[0].body.template.components[0].parameters[0].text, 'Café Aroma');
    const db2 = freshDb(); // sin opt-in
    r = await wa.notifySundayLetter(db2, 1, { approveUrl: '/aprobar/TOK', env: ENV_ON, fetchImpl: stubFetch([]) });
    assert.strictEqual(r.skipped, 'not_opted_in');
    r = await wa.notifySundayLetter(db, 1, { approveUrl: '', env: ENV_ON, fetchImpl: stubFetch([]) });
    assert.strictEqual(r.skipped, 'no_approvable_week');
    r = await wa.notifySundayLetter(db, 1, { approveUrl: '/aprobar/TOK', env: ENV_OFF, fetchImpl: stubFetch([]) });
    assert.strictEqual(r.skipped, 'disabled');
  });
  await t('webhook verify: challenge solo con token correcto', () => {
    assert.strictEqual(wa.verifyWebhook('subscribe', 'verify-me', 'CHAL', ENV_ON), 'CHAL');
    assert.strictEqual(wa.verifyWebhook('subscribe', 'otro', 'CHAL', ENV_ON), null);
    assert.strictEqual(wa.verifyWebhook('subscribe', 'verify-me', 'CHAL', ENV_OFF), null);
  });
  await t('firma HMAC: correcta, incorrecta, sin secreto', () => {
    const crypto = require('node:crypto');
    const body = Buffer.from('{"a":1}');
    const sig = 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex');
    assert.strictEqual(wa.verifySignature('appsecret', body, sig), true);
    assert.strictEqual(wa.verifySignature('appsecret', body, 'sha256=00'), false);
    assert.strictEqual(wa.verifySignature('', body, sig), false);
  });
  await t('handleIncoming: baja apaga opt-in; texto normal no toca; estado actualiza log', () => {
    const db = freshDb();
    wa.applyNotifyPrefs(db, 1, { wa_notify_num: '5491123456789', wa_notify_optin: true });
    db.prepare("INSERT INTO whatsapp_send_log (ts, user_id, to_num, template, lang, kind, status, provider_id, error) VALUES (1,1,?,?,?,?,?,?,?)")
      .run('5491123456789', 'carta_semanal', 'es', 'carta', 'sent', 'wamid.123', '');
    let out = wa.handleIncoming(db, { entry: [{ changes: [{ value: { messages: [{ from: '5491123456789', text: { body: 'baja' } }], statuses: [{ id: 'wamid.123', status: 'delivered' }] } }] }] });
    assert.strictEqual(out.optouts, 1);
    assert.strictEqual(out.statuses, 1);
    const row = db.prepare('SELECT wa_notify_optin_at, wa_notify_optout_at FROM users WHERE id = 1').get();
    assert.strictEqual(wa.isSendable({ wa_notify_num: '5491123456789', wa_notify_optin_at: row.wa_notify_optin_at, wa_notify_optout_at: row.wa_notify_optout_at }), false);
    const log = db.prepare('SELECT status FROM whatsapp_send_log WHERE provider_id = ?').get('wamid.123');
    assert.strictEqual(log.status, 'delivered');
    out = wa.handleIncoming(db, { entry: [{ changes: [{ value: { messages: [{ from: '5491123456789', text: { body: 'gracias!' } }] } }] }] });
    assert.strictEqual(out.optouts, 0);
  });
  await t('ensureSchema idempotente y por DB (dos DBs distintas)', () => {
    const a = freshDb();
    const b = freshDb();
    assert.strictEqual(wa.ensureSchema(a), true);
    assert.strictEqual(wa.ensureSchema(a), true);
    assert.strictEqual(wa.ensureSchema(b), true); // el memo es por objeto, no global
    const cols = b.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    for (const c of ['wa_notify_num', 'wa_notify_optin_at', 'wa_notify_optout_at', 'wa_notify_src']) assert.ok(cols.includes(c), 'falta ' + c);
  });
  console.log(`\n${pass}/${total} tests OK`);
  if (pass !== total) process.exit(1);
})();
