// test-tiendanube-webhooks.js — Webhooks de Tiendanube (homologación):
// firma oficial (raw body + HMAC-SHA256 hex/base64), store/redact con
// purga real, customers/redact sin guardar PII, data_request con el
// reporte honesto y app/uninstalled cortando el sync. (2026-10-20)
// Uso: node test-tiendanube-webhooks.js
'use strict';
process.env.TIENDANUBE_CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID || '47715';
process.env.TIENDANUBE_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || 'test-secret-webhooks';

const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const tiendanube = require('./tiendanube.js');
const clientDigest = require('./client-digest.js');
const wh = require('./tiendanube-webhooks.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

const SECRET = process.env.TIENDANUBE_CLIENT_SECRET;
const sign = (body, enc) => crypto.createHmac('sha256', SECRET).update(body).digest(enc || 'hex');

function freshDb(withConnection) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT)`);
  db.prepare('INSERT INTO users (email) VALUES (?)').run('duena@tienda.com');
  if (withConnection) {
    tiendanube.saveConnection(db, 1, {
      store_id: '1234567', store_name: 'Tienda Demo',
      access_token: 'tok_secreto', scope: 'read_products,read_orders',
    });
    const d = clientDigest.emptyDigest();
    d.connections = { tiendanube: {
      store_id: '1234567', store_name: 'Tienda Demo', products_total: 24,
      star: { name: 'Remera Oversize', units_30d: 31 },
      top_sellers: [{ name: 'Remera Oversize', units_30d: 31 }],
      out_of_stock: ['Buzo Cargo'], quiet: ['Pantalón Denim'],
      synced_at: '2026-10-20T00:00:00.000Z', connected_at: '2026-10-19T00:00:00.000Z',
    } };
    clientDigest.saveDigest(db, 1, d);
  }
  return db;
}
const tnBlock = (db) => {
  const s = clientDigest.getStoredDigest(db, 1);
  return s && s.connections && s.connections.tiendanube;
};

console.log('— firma HMAC (doc oficial: cuerpo crudo + secret, header x-linkedstore-hmac-sha256)');
{
  const body = JSON.stringify({ store_id: 1234567, event: 'store/redact' });
  check('hex válida → true', wh.verifyWebhookSignature(body, sign(body), SECRET) === true);
  check('base64 del mismo digest → true', wh.verifyWebhookSignature(Buffer.from(body), sign(body, 'base64'), SECRET) === true);
  check('firma de OTRO cuerpo → false', wh.verifyWebhookSignature(body, sign('{"store_id":9}'), SECRET) === false);
  check('secret equivocado → false', wh.verifyWebhookSignature(body, crypto.createHmac('sha256', 'otra').update(body).digest('hex'), SECRET) === false);
  check('sin header → false', wh.verifyWebhookSignature(body, '', SECRET) === false);
  check('sin secret → false', wh.verifyWebhookSignature(body, sign(body), '') === false);
  check('cuerpo alterado por 1 byte → false', wh.verifyWebhookSignature(body + ' ', sign(body), SECRET) === false);
}

console.log('— store/redact: purga completa + idempotencia');
{
  const db = freshDb(true);
  const body = JSON.stringify({ store_id: 1234567, event: 'store/redact' });
  const r = wh.processWebhook(db, 'store-redact', JSON.parse(body), body, sign(body));
  check('responde 200', r.status === 200 && r.body.ok === true);
  check('conexión borrada de user_connections', !db.prepare("SELECT 1 FROM user_connections WHERE provider='tiendanube'").get());
  check('bloque TN fuera del digest', !tnBlock(db));
  check('getConnection ya no devuelve nada', tiendanube.getConnection(db, 1) === null);
  const log = db.prepare("SELECT * FROM tn_privacy_log WHERE event='store/redact'").get();
  check('constancia registrada en tn_privacy_log', !!log && log.store_id === '1234567');
  const r2 = wh.processWebhook(db, 'store-redact', JSON.parse(body), body, sign(body));
  check('repetir el webhook no rompe (idempotente)', r2.status === 200 && r2.body.connection_deleted === false);
}

console.log('— firma inválida: 401 y NO se toca nada');
{
  const db = freshDb(true);
  const body = JSON.stringify({ store_id: 1234567, event: 'store/redact' });
  const r = wh.processWebhook(db, 'store-redact', JSON.parse(body), body, 'firma-trucha');
  check('responde 401', r.status === 401);
  check('conexión intacta', !!tiendanube.getConnection(db, 1));
  check('digest intacto', !!tnBlock(db));
  wh.ensurePrivacyLog(db); // la tabla se crea perezosa: en el camino 401 nadie la toca
  check('sin constancia falsa', !db.prepare('SELECT 1 FROM tn_privacy_log').get());
}

console.log('— customers/redact: constancia SIN guardar datos del cliente');
{
  const db = freshDb(true);
  const payload = {
    store_id: 1234567, event: 'customers/redact',
    customer: { id: 555, email: 'compradora@example.com', phone: '+5491100000000', identification: '30111222' },
    orders_to_redact: [9001, 9002],
  };
  const body = JSON.stringify(payload);
  const r = wh.processWebhook(db, 'customers-redact', payload, body, sign(body));
  check('responde 200', r.status === 200);
  check('reporta 0 registros de cliente (Posty no guarda compradores)', r.body.customer_records_deleted === 0);
  check('la conexión del comerciante NO se toca', !!tiendanube.getConnection(db, 1));
  const log = db.prepare("SELECT * FROM tn_privacy_log WHERE event='customers/redact'").get();
  check('constancia con id del cliente', !!log && log.subject_id === '555');
  check('hash del email = sha256(email)', !!log && log.subject_hash === crypto.createHash('sha256').update('compradora@example.com').digest('hex'));
  const todoElLog = JSON.stringify(db.prepare('SELECT * FROM tn_privacy_log').all());
  check('el log NO contiene el email crudo', !todoElLog.includes('compradora@example.com'));
  check('el log NO contiene el teléfono', !todoElLog.includes('1100000000'));
  check('el log NO contiene el DNI', !todoElLog.includes('30111222'));
}

console.log('— customers/data_request: el reporte refleja lo que Posty REALMENTE guarda');
{
  const db = freshDb(true);
  const payload = {
    store_id: 1234567, event: 'customers/data_request',
    customer: { id: 555, email: 'compradora@example.com' },
    orders_requested: [9001], data_request: { id: 777 },
  };
  const body = JSON.stringify(payload);
  const r = wh.processWebhook(db, 'customers-data-request', payload, body, sign(body));
  check('responde 200', r.status === 200);
  check('reporte con id de la solicitud', r.body.report && r.body.report.data_request_id === 777);
  check('reporte: datos personales del cliente = lista vacía', Array.isArray(r.body.report.customer_personal_data) && r.body.report.customer_personal_data.length === 0);
  check('reporte: la conexión del comerciante sí figura', r.body.report.connection && r.body.report.connection.store_name === 'Tienda Demo');
  check('reporte: digest derivado con la estrella', r.body.report.derived_digest && r.body.report.derived_digest.star.name === 'Remera Oversize');
  const rep = JSON.stringify(r.body.report);
  check('el reporte NO filtra el email del cliente', !rep.includes('compradora@example.com'));
  check('constancia registrada', !!db.prepare("SELECT 1 FROM tn_privacy_log WHERE event='customers/data_request'").get());
}

console.log('— app/uninstalled: corta la conexión y el sync futuro');
{
  const db = freshDb(true);
  db.exec(`CREATE TABLE tn_pending_installs (id TEXT PRIMARY KEY, store_id TEXT, access_token TEXT, created_at INTEGER)`);
  db.prepare('INSERT INTO tn_pending_installs VALUES (?,?,?,?)').run('pend1', '1234567', 'tok', Date.now());
  const payload = { store_id: 1234567, event: 'app/uninstalled', id: 47715 };
  const body = JSON.stringify(payload);
  const r = wh.processWebhook(db, 'app-uninstalled', payload, body, sign(body));
  check('responde 200', r.status === 200);
  const row = db.prepare("SELECT * FROM user_connections WHERE provider='tiendanube'").get();
  check('la fila queda como historial con status uninstalled', !!row && row.status === 'uninstalled');
  check('token vaciado', !!row && row.access_token === '');
  check('getConnection = null (ningún sync futuro la usa)', tiendanube.getConnection(db, 1) === null);
  check('bloque TN fuera del digest', !tnBlock(db));
  check('instalación pendiente de esa tienda descartada', !db.prepare('SELECT 1 FROM tn_pending_installs').get());
  const r2 = wh.processWebhook(db, 'app-uninstalled', payload, body, sign(body));
  check('idempotente', r2.status === 200);
}

console.log('— casos borde del despachador');
{
  const db = freshDb(true);
  const body = JSON.stringify({ store_id: 9999999, event: 'store/redact' });
  const r = wh.processWebhook(db, 'store-redact', JSON.parse(body), body, sign(body));
  check('tienda desconocida → 200 igual (sin reintentos inútiles)', r.status === 200 && r.body.connection_deleted === false);
  check('topic desconocido → 404', wh.processWebhook(db, 'order-created', {}, '{}', sign('{}')).status === 404);
  check('sin rawBody → 400 (el patch de server.js lo garantiza)', wh.processWebhook(db, 'store-redact', {}, null, 'x').status === 400);
  const r2 = wh.processWebhook(db, 'store-redact', null, body, sign(body));
  check('payload no-objeto no rompe', r2.status === 200);
}

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
