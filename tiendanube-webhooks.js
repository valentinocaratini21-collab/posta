// tiendanube-webhooks.js — Webhooks de Tiendanube: los 3 de PRIVACIDAD
// obligatorios para listar en la Tienda de Aplicaciones (store/redact,
// customers/redact, customers/data_request) + app/uninstalled.
// (2026-10-20, paquete de homologación de la app Partners ID 47715.)
//
// Superficie verificada contra la doc oficial (tiendanube.github.io,
// api-documentation/resources/webhook, 2026-10-20):
// · TODOS los webhooks llegan por POST con JSON {store_id, event, ...}.
//   Tiendanube espera 2XX en ≤3 s; si no, reintenta hasta 16 veces en 48 h.
// · Firma: header `x-linkedstore-hmac-sha256` = HMAC-SHA256 del CUERPO
//   CRUDO firmado con el Client Secret de la app. El ejemplo oficial en
//   PHP compara contra hash_hmac() sin salida cruda = HEX minúscula.
//   Aceptamos también la misma firma codificada en base64 (mismo digest,
//   otra codificación: no baja la seguridad y cubre variantes del emisor).
// · store/redact: {store_id} — borrar TODA la información de la tienda.
// · customers/redact: {store_id, customer:{id,email,phone,identification},
//   orders_to_redact:[...]} — borrar los datos de ESE consumidor.
// · customers/data_request: {store_id, customer:{...}, orders_requested,
//   checkouts_requested, drafts_orders_requested, data_request:{id}} —
//   la app debe informarle al comerciante qué datos tiene del consumidor.
// · app/uninstalled: {store_id, event:'app/uninstalled', id:<app_id>}.
//
// Qué datos tiene Posty de una tienda (por diseño, tiendanube.js): la
// conexión OAuth (token, scopes, nombre) y un bloque DERIVADO en el
// digest (catálogo agregado: estrella por unidades, sin-stock, quietos).
// Posty NO guarda datos personales de los compradores de la tienda (ni
// nombres, ni emails, ni montos): customers/redact y data_request se
// cumplen registrando la constancia y reportando exactamente eso.
//
// Módulo desacoplado (mismo patrón que ig-calendar-guard.js): opera vía
// el handle `db` que le pasan. El cableado HTTP en server.js (ruta POST
// /api/webhooks/tiendanube/:topic + rawBody) va especificado en el
// paquete de homologación porque server.js es zona de otro build.
'use strict';

const crypto = require('crypto');
const tiendanube = require('./tiendanube.js');
const clientDigest = require('./client-digest.js');

// Ruta pública (topic con guiones) → evento oficial de Tiendanube.
const TOPICS = {
  'store-redact': 'store/redact',
  'customers-redact': 'customers/redact',
  'customers-data-request': 'customers/data_request',
  'app-uninstalled': 'app/uninstalled',
};

/* Firma válida: HMAC-SHA256 del cuerpo crudo con el Client Secret.
 * rawBody puede ser Buffer o string. Comparación en tiempo constante. */
function verifyWebhookSignature(rawBody, headerValue, secret) {
  try {
    if (!secret || !headerValue) return false;
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
    const digest = crypto.createHmac('sha256', secret).update(body).digest();
    const given = String(headerValue).trim();
    const candidates = [digest.toString('hex'), digest.toString('base64')];
    for (const cand of candidates) {
      const a = Buffer.from(given.toLowerCase());
      const b = Buffer.from(cand.toLowerCase());
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return false;
  } catch (e) { return false; }
}

/* Constancia de cumplimiento: una fila por notificación procesada.
 * NUNCA guarda datos personales del consumidor: del cliente solo el id
 * que manda Tiendanube y el hash SHA-256 de su email (prueba de proceso
 * sin conservar el dato). Del comerciante queda store_id y el resultado
 * (qué se borró), que es la evidencia que la propia ley pide poder mostrar. */
function ensurePrivacyLog(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS tn_privacy_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      store_id TEXT DEFAULT '',
      subject_id TEXT DEFAULT '',
      subject_hash TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch (e) { /* defensivo */ }
}

function logPrivacy(db, event, storeId, subject, detail) {
  try {
    ensurePrivacyLog(db);
    const subj = subject || {};
    db.prepare(`INSERT INTO tn_privacy_log (event, store_id, subject_id, subject_hash, detail)
      VALUES (?, ?, ?, ?, ?)`)
      .run(String(event || ''), String(storeId || ''),
        String(subj.id || ''), String(subj.hash || ''),
        JSON.stringify(detail || {}));
  } catch (e) { /* el log nunca bloquea la respuesta 200 */ }
}

function hashEmail(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return '';
  return crypto.createHash('sha256').update(em).digest('hex');
}

/* La conexión dueña de una tienda (puede no existir: el webhook igual
 * se responde 200 — Tiendanube reintenta ante cualquier no-2XX). */
function findConnectionByStoreId(db, storeId) {
  try {
    tiendanube.ensureTable(db);
    return db.prepare('SELECT * FROM user_connections WHERE provider = ? AND store_id = ?')
      .get('tiendanube', String(storeId || '')) || null;
  } catch (e) { return null; }
}

/* Saca el bloque de Tiendanube del digest del usuario — la MISMA forma
 * que el endpoint de desconexión manual de server.js. Devuelve si había
 * bloque para limpiar. */
function stripDigestBlock(db, userId) {
  try {
    const stored = clientDigest.getStoredDigest(db, userId);
    if (stored && stored.connections && stored.connections.tiendanube) {
      delete stored.connections.tiendanube;
      if (!Object.keys(stored.connections).length) delete stored.connections;
      clientDigest.saveDigest(db, userId, stored);
      return true;
    }
  } catch (e) { /* sin digest guardado no hay bloque que limpiar */ }
  return false;
}

/* Borrado total de lo que Posty tiene de una tienda: fila de conexión
 * (con su token) + bloque derivado del digest. Idempotente. */
function purgeStoreData(db, storeId) {
  const conn = findConnectionByStoreId(db, storeId);
  if (!conn) return { user_id: null, connection_deleted: false, digest_cleaned: false };
  const digestCleaned = stripDigestBlock(db, conn.user_id);
  try {
    db.prepare('DELETE FROM user_connections WHERE user_id = ? AND provider = ?')
      .run(conn.user_id, 'tiendanube');
  } catch (e) { /* la fila puede no existir ya */ }
  return { user_id: conn.user_id, connection_deleted: true, digest_cleaned: digestCleaned };
}

// ---------- handlers por evento (payload ya verificado) ----------

/* store/redact: el comerciante desinstaló y Tiendanube pide borrar
 * todo rastro de su tienda. Se ejecuta la purga completa. */
function handleStoreRedact(db, payload) {
  const storeId = payload && payload.store_id;
  const r = purgeStoreData(db, storeId);
  logPrivacy(db, 'store/redact', storeId, null, {
    user_id: r.user_id, connection_deleted: r.connection_deleted, digest_cleaned: r.digest_cleaned,
  });
  return r;
}

/* customers/redact: borrar los datos de UN consumidor de la tienda.
 * Posty no almacena datos de consumidores (solo unidades agregadas por
 * producto), así que el cumplimiento es constancia + cero filas que
 * borrar. Si mañana el digest guardara algo por consumidor, se purga acá. */
function handleCustomersRedact(db, payload) {
  const storeId = payload && payload.store_id;
  const customer = (payload && payload.customer) || {};
  const orders = Array.isArray(payload && payload.orders_to_redact) ? payload.orders_to_redact : [];
  logPrivacy(db, 'customers/redact', storeId,
    { id: customer.id, hash: hashEmail(customer.email) },
    { orders_to_redact: orders.length, customer_records_deleted: 0, held_customer_data: false });
  return { customer_records_deleted: 0, held_customer_data: false, orders_to_redact: orders.length };
}

/* customers/data_request: qué datos tiene Posty vinculados a ese
 * consumidor/tienda. La respuesta honesta sale de la estructura real:
 * datos del COMERCIANTE (conexión + agregados de su catálogo) y CERO
 * datos personales de compradores. El objeto `report` es lo que el flujo
 * operativo le entrega al comerciante (ver especificación en el paquete
 * de homologación); el webhook en sí responde 200 y deja constancia. */
function buildDataRequestReport(db, payload) {
  const storeId = payload && payload.store_id;
  const conn = findConnectionByStoreId(db, storeId);
  let derived = null;
  if (conn) {
    try {
      const stored = clientDigest.getStoredDigest(db, conn.user_id);
      const block = stored && stored.connections && stored.connections.tiendanube;
      if (block) {
        derived = {
          store_name: block.store_name || '',
          connected_at: block.connected_at || null,
          synced_at: block.synced_at || null,
          products_total: block.products_total != null ? block.products_total : null,
          star: block.star || null,
          top_sellers: block.top_sellers || [],
          out_of_stock: block.out_of_stock || [],
          quiet: block.quiet || [],
        };
      }
    } catch (e) { /* el reporte sale con lo que haya */ }
  }
  return {
    store_id: storeId != null ? String(storeId) : '',
    data_request_id: (payload && payload.data_request && payload.data_request.id) || null,
    connection: conn ? {
      store_name: conn.store_name || '', scope: conn.scope || '',
      status: conn.status || '', connected_since: conn.created_at || null,
    } : null,
    derived_digest: derived,
    // Por diseño (tiendanube.js): jamás se guardó comprador, email ni monto.
    customer_personal_data: [],
    customer_personal_data_note: 'Posty no almacena datos personales de los clientes de la tienda: de las órdenes solo procesa unidades agregadas por producto.',
  };
}

function handleDataRequest(db, payload) {
  const report = buildDataRequestReport(db, payload);
  const customer = (payload && payload.customer) || {};
  logPrivacy(db, 'customers/data_request', payload && payload.store_id,
    { id: customer.id, hash: hashEmail(customer.email) },
    { data_request_id: report.data_request_id, connection_found: !!report.connection });
  return { report };
}

/* app/uninstalled: la tienda desinstaló la app. La conexión muere del
 * lado Posty: status 'uninstalled', token vaciado (ningún sync futuro
 * puede usarlo: getConnection exige access_token) y el bloque TN sale
 * del digest, espejo de la desconexión manual pero conservando la fila
 * como historial. También se descartan instalaciones pendientes de esa
 * tienda (tn-install.js). Idempotente. */
function handleAppUninstalled(db, payload) {
  const storeId = payload && payload.store_id;
  const conn = findConnectionByStoreId(db, storeId);
  let digestCleaned = false;
  if (conn) {
    digestCleaned = stripDigestBlock(db, conn.user_id);
    try {
      db.prepare(`UPDATE user_connections SET status = 'uninstalled', access_token = '',
        updated_at = datetime('now') WHERE user_id = ? AND provider = ?`)
        .run(conn.user_id, 'tiendanube');
    } catch (e) { /* fila ya tocada por otra vía */ }
  }
  try {
    db.prepare('DELETE FROM tn_pending_installs WHERE store_id = ?').run(String(storeId || ''));
  } catch (e) { /* la tabla de pendientes puede no existir todavía */ }
  logPrivacy(db, 'app/uninstalled', storeId, null, {
    user_id: conn ? conn.user_id : null, connection_found: !!conn, digest_cleaned: digestCleaned,
  });
  return { user_id: conn ? conn.user_id : null, connection_found: !!conn, digest_cleaned: digestCleaned };
}

/* Despachador único para la ruta HTTP. Devuelve {status, body} y NUNCA
 * procesa sin firma válida (salvo que Tiendanube no esté configurada,
 * caso en el que se responde 500 honesto y no se toca nada). */
function processWebhook(db, topic, payload, rawBody, signatureHeader) {
  const event = TOPICS[String(topic || '')];
  if (!event) return { status: 404, body: { ok: false, error: 'webhook_desconocido' } };
  const secret = tiendanube.clientSecret();
  if (!secret) return { status: 500, body: { ok: false, error: 'tiendanube_no_configurada' } };
  if (rawBody == null) return { status: 400, body: { ok: false, error: 'raw_body_requerido' } };
  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    return { status: 401, body: { ok: false, error: 'firma_invalida' } };
  }
  const p = payload && typeof payload === 'object' ? payload : {};
  try {
    let result;
    if (event === 'store/redact') result = handleStoreRedact(db, p);
    else if (event === 'customers/redact') result = handleCustomersRedact(db, p);
    else if (event === 'customers/data_request') result = handleDataRequest(db, p);
    else result = handleAppUninstalled(db, p);
    return { status: 200, body: { ok: true, event, ...result } };
  } catch (e) {
    // Error real de proceso: 500 para que Tiendanube reintente (su
    // política reintenta los no-2XX hasta 16 veces en 48 h).
    console.error('[tiendanube/webhook]', event, e.message);
    return { status: 500, body: { ok: false, error: 'proceso_fallo' } };
  }
}

module.exports = {
  TOPICS,
  verifyWebhookSignature,
  ensurePrivacyLog,
  findConnectionByStoreId,
  stripDigestBlock,
  purgeStoreData,
  buildDataRequestReport,
  handleStoreRedact,
  handleCustomersRedact,
  handleDataRequest,
  handleAppUninstalled,
  processWebhook,
};
