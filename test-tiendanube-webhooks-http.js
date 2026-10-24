// test-tiendanube-webhooks-http.js — Webhooks de PRIVACIDAD de
// Tiendanube por la capa HTTP real (homologación, app Partners 47715):
// la ruta POST /api/webhooks/tiendanube/:topic con el server booteado —
// firma HMAC sobre el cuerpo crudo (header x-linkedstore-hmac-sha256),
// topic desconocido 404, firma inválida 401 sin efectos, store/redact
// con purga SOLO de la tienda del payload, constancia durable en
// tn_privacy_log, customers/redact sin guardar PII, data_request con
// el reporte honesto e idempotencia ante reenvíos. La semántica fina
// de cada handler vive en test-tiendanube-webhooks.js (módulo); acá se
// prueba el cableado que la homologación mira: URL viva + firma + raw.
// Uso: node test-tiendanube-webhooks-http.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-tnwh-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18793';
process.env.BASE_URL = 'http://127.0.0.1:18793';
process.env.OPENAI_API_KEY = 'test-key';
process.env.TIENDANUBE_CLIENT_ID = '47715';
process.env.TIENDANUBE_CLIENT_SECRET = 'secreto-http-test';
delete process.env.GEMINI_API_KEY;

const SECRET = process.env.TIENDANUBE_CLIENT_SECRET;
const sign = (body, enc) => crypto.createHmac('sha256', SECRET).update(body).digest(enc || 'hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

(async () => {
  const db = require('./db');
  const tiendanube = require('./tiendanube.js');
  const tnWebhooks = require('./tiendanube-webhooks.js');
  const clientDigest = require('./client-digest.js');
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:18793/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }

  const post = async (topic, rawBody, headers) => {
    const r = await fetch('http://127.0.0.1:18793/api/webhooks/tiendanube/' + topic, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: rawBody,
    });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j };
  };
  const reg = async (email) => {
    const r = await fetch('http://127.0.0.1:18793/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'secreto1' }),
    });
    if (r.status !== 200) throw new Error('registro ' + email + ' → HTTP ' + r.status);
    return db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  };
  const seedStore = (uid, storeId, name) => {
    tiendanube.saveConnection(db, uid, {
      store_id: storeId, store_name: name,
      access_token: 'tok_' + storeId, scope: 'read_products', status: 'connected',
    });
    const d = clientDigest.emptyDigest();
    d.connections = { tiendanube: {
      store_id: storeId, store_name: name, products_total: 10,
      star: { name: 'Producto ' + storeId, units_30d: 5 },
      top_sellers: [], out_of_stock: [], quiet: [],
      synced_at: '2026-10-24T00:00:00.000Z', connected_at: '2026-10-23T00:00:00.000Z',
    } };
    clientDigest.saveDigest(db, uid, d);
  };
  const blockOf = (uid) => {
    const s = clientDigest.getStoredDigest(db, uid);
    return s && s.connections && s.connections.tiendanube;
  };

  const uidA = await reg('duena.a@tienda.test');
  const uidB = await reg('duena.b@tienda.test');
  seedStore(uidA, '111111', 'Tienda A');
  seedStore(uidB, '222222', 'Tienda B');

  console.log('— la ruta existe y despacha por topic');
  {
    const r = await post('order-created', JSON.stringify({ store_id: 111111, event: 'order/created' }),
      { 'x-linkedstore-hmac-sha256': sign('{}') });
    check('topic desconocido → 404 webhook_desconocido', r.status === 404 && r.json && r.json.error === 'webhook_desconocido', JSON.stringify(r));
  }

  console.log('— firma inválida: 401 y NO se toca nada');
  {
    const body = JSON.stringify({ store_id: 111111, event: 'store/redact' });
    const sinFirma = await post('store-redact', body, {});
    check('sin header de firma → 401', sinFirma.status === 401, JSON.stringify(sinFirma));
    const otraFirma = await post('store-redact', body, { 'x-linkedstore-hmac-sha256': sign('{"store_id":999}') });
    check('firma de otro cuerpo → 401', otraFirma.status === 401, JSON.stringify(otraFirma));
    const malSecreto = await post('store-redact', body, {
      'x-linkedstore-hmac-sha256': crypto.createHmac('sha256', 'otra-clave').update(body).digest('hex'),
    });
    check('firma con otro secreto → 401', malSecreto.status === 401, JSON.stringify(malSecreto));
    check('la conexión de A sigue intacta', !!tiendanube.getConnection(db, uidA));
    check('el digest de A sigue intacto', !!blockOf(uidA));
    tnWebhooks.ensurePrivacyLog(db); // la tabla se crea perezosa: en el camino 401 nadie la toca
    check('sin constancias falsas en tn_privacy_log',
      !db.prepare('SELECT 1 FROM tn_privacy_log').get());
  }

  console.log('— store/redact válido: purga SOLO la tienda del payload + constancia');
  {
    const body = JSON.stringify({ store_id: 111111, event: 'store/redact' });
    const r = await post('store-redact', body, { 'x-linkedstore-hmac-sha256': sign(body) });
    check('responde 200 ok', r.status === 200 && r.json && r.json.ok === true, JSON.stringify(r));
    check('conexión de A borrada', tiendanube.getConnection(db, uidA) === null);
    check('bloque TN fuera del digest de A', !blockOf(uidA));
    check('la conexión de B NO se tocó', !!tiendanube.getConnection(db, uidB));
    check('el digest de B NO se tocó', !!blockOf(uidB));
    const log = db.prepare("SELECT * FROM tn_privacy_log WHERE event = 'store/redact'").get();
    check('constancia durable registrada (store_id del payload)', !!log && log.store_id === '111111');
    const r2 = await post('store-redact', body, { 'x-linkedstore-hmac-sha256': sign(body) });
    check('reenvío idempotente → 200 sin error', r2.status === 200 && r2.json.connection_deleted === false, JSON.stringify(r2.json));
  }

  console.log('— customers/redact: constancia SIN guardar datos del cliente');
  {
    const payload = {
      store_id: 222222, event: 'customers/redact',
      customer: { id: 555, email: 'compradora@example.com', phone: '+5491100000000', identification: '30111222' },
      orders_to_redact: [9001, 9002],
    };
    const body = JSON.stringify(payload);
    const r = await post('customers-redact', body, { 'x-linkedstore-hmac-sha256': sign(body) });
    check('responde 200', r.status === 200 && r.json.ok === true, JSON.stringify(r));
    check('la conexión de B sigue viva', !!tiendanube.getConnection(db, uidB));
    const log = db.prepare("SELECT * FROM tn_privacy_log WHERE event = 'customers/redact'").get();
    check('constancia con hash sha256 del email (sin el email)',
      !!log && log.subject_hash === crypto.createHash('sha256').update('compradora@example.com').digest('hex'));
    const todoElLog = JSON.stringify(db.prepare('SELECT * FROM tn_privacy_log').all());
    check('el log NO contiene email/teléfono/DNI crudos',
      !todoElLog.includes('compradora@example.com') && !todoElLog.includes('1100000000') && !todoElLog.includes('30111222'));
  }

  console.log('— customers/data_request: reporte honesto (firma base64 también válida)');
  {
    const payload = {
      store_id: 222222, event: 'customers/data_request',
      customer: { id: 555, email: 'compradora@example.com' },
      orders_requested: [9001], data_request: { id: 777 },
    };
    const body = JSON.stringify(payload);
    const r = await post('customers-data-request', body, { 'x-linkedstore-hmac-sha256': sign(body, 'base64') });
    check('responde 200 con el reporte', r.status === 200 && !!r.json.report, JSON.stringify(r.json).slice(0, 160));
    check('reporte: id de la solicitud', !!r.json.report && r.json.report.data_request_id === 777);
    check('reporte: datos personales del cliente = []',
      !!r.json.report && Array.isArray(r.json.report.customer_personal_data) && r.json.report.customer_personal_data.length === 0);
    check('reporte: la conexión de B figura', !!r.json.report && !!r.json.report.connection && r.json.report.connection.store_name === 'Tienda B');
  }

  console.log('— app/uninstalled: la conexión muere del lado Posty');
  {
    const body = JSON.stringify({ store_id: 222222, event: 'app/uninstalled', id: 47715 });
    const r = await post('app-uninstalled', body, { 'x-linkedstore-hmac-sha256': sign(body) });
    check('responde 200', r.status === 200 && r.json.ok === true, JSON.stringify(r));
    const row = db.prepare("SELECT * FROM user_connections WHERE provider = 'tiendanube' AND user_id = ?").get(uidB);
    check('fila historial: status uninstalled y token vaciado', !!row && row.status === 'uninstalled' && row.access_token === '');
    check('getConnection de B = null (sin sync futuro)', tiendanube.getConnection(db, uidB) === null);
  }

  console.log(`\n${pass} ok · ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ test-tiendanube-webhooks-http:', e); process.exit(1); });
