// venty-whatsapp.js — VENTY-CONECTAR-4: WhatsApp por cliente (no el global).
// El módulo global server/whatsapp.js habla con UN solo número (env
// WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID, la carta de Posty). Venty
// necesita UN número por negocio: cada cliente conecta su número de
// WhatsApp Business y Venty escribe desde ahí, con su voz y su gobernador.
//
// Cómo se resuelve la credencial (nunca en claro en DB):
//   la conexión (venty-conexiones.js, canal whatsapp) guarda solo
//   `credencial_ref`, p. ej. `VENTY_WA_TOKEN_U123`. El valor vive en env /
//   vault bajo ese nombre; acá se lee en el momento del envío y no se
//   persiste ni se loguea. `cuenta_ref` guarda el phone_number_id público
//   para rutear el webhook entrante al dueño correcto.
// Sin credencial_ref, sin valor en env, sin cupo del gobernador o con la
// conexión revocada: fail-closed, no sale nada.
//
// Envío: texto libre por lead (no plantillas de la carta). Las plantillas
// de ventas en Meta quedan como pendientes de aprobación (ver STATUS.md):
// fuera de la ventana de 24 h el texto libre lo rechaza Meta y el error
// queda en el log; acá no se inventa ninguna plantilla.
// Recepción: hilos por lead (un hilo por número del prospecto), con baja
// por mensaje (baja/stop/salir) que marca el opt-out del lead.
// La verificación del webhook (GET + firma HMAC) se reutiliza de
// server/whatsapp.js: verifyWebhook / verifySignature (mismo secreto de app).
'use strict';

const crypto = require('crypto');
const whatsappGlobal = require('./server/whatsapp');
const gobernador = require('./venty-gobernador');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

function fail(m) { const e = new Error(m); e.ventyWhatsapp = true; throw e; }
function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function normalizeWaNumber(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 20);
}

// Resuelve token + phone_number_id por cliente desde env/vault por ref.
// refs esperadas: <ref> → token; <ref>_PHONE_NUMBER_ID → phone_number_id.
// Ej.: ref VENTY_WA_TOKEN_U123 → env VENTY_WA_TOKEN_U123 y
// VENTY_WA_TOKEN_U123_PHONE_NUMBER_ID. El valor jamás se guarda ni se
// devuelve: solo se usa para el llamado.
function resolverCredencial(ref, vault) {
  const r = String(ref || '').trim();
  if (!r) return { token: '', phoneNumberId: '' };
  const leer = (k) => {
    if (vault && typeof vault.get === 'function') { try { const v = vault.get(k); if (v) return String(v); } catch (e) {} }
    return process.env[k] || '';
  };
  return { token: leer(r), phoneNumberId: leer(r + '_PHONE_NUMBER_ID') };
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_wa_hilos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lead_id INTEGER,
    wa_numero TEXT NOT NULL DEFAULT '',
    opt_out INTEGER NOT NULL DEFAULT 0,
    ultimo_mensaje_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, wa_numero)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_wa_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hilo_id INTEGER NOT NULL,
    direccion TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_wa_msg_hilo ON venty_wa_mensajes(hilo_id, created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_wa_msg_prov ON venty_wa_mensajes(provider_id)');
}

function obtenerHilo(db, userId, numero, leadId) {
  ensureSchema(db);
  const num = normalizeWaNumber(numero);
  if (!num) return null;
  let row = db.prepare('SELECT * FROM venty_wa_hilos WHERE user_id = ? AND wa_numero = ?').get(userId, num);
  if (!row) {
    const r = db.prepare(`INSERT INTO venty_wa_hilos (user_id, lead_id, wa_numero, created_at) VALUES (?,?,?,?)`)
      .run(userId, leadId || null, num, ahoraIso());
    row = db.prepare('SELECT * FROM venty_wa_hilos WHERE id = ?').get(Number(r.lastInsertRowid));
  } else if (leadId && !row.lead_id) {
    db.prepare('UPDATE venty_wa_hilos SET lead_id = ? WHERE id = ?').run(leadId, row.id);
    row.lead_id = leadId;
  }
  return row;
}

function listarHilos(db, userId) {
  ensureSchema(db);
  return db.prepare(`SELECT h.*, (SELECT texto FROM venty_wa_mensajes WHERE hilo_id = h.id ORDER BY id DESC LIMIT 1) AS ultimo_texto,
    (SELECT COUNT(*) FROM venty_wa_mensajes WHERE hilo_id = h.id) AS mensajes
    FROM venty_wa_hilos h WHERE h.user_id = ? ORDER BY h.ultimo_mensaje_at DESC, h.id DESC`).all(userId);
}

function listarMensajes(db, userId, hiloId) {
  ensureSchema(db);
  const hilo = db.prepare('SELECT * FROM venty_wa_hilos WHERE id = ? AND user_id = ?').get(hiloId, userId);
  if (!hilo) return null;
  return { hilo, mensajes: db.prepare('SELECT * FROM venty_wa_mensajes WHERE hilo_id = ? ORDER BY id ASC').all(hiloId) };
}

function marcarOptOut(db, userId, numero) {
  ensureSchema(db);
  const num = normalizeWaNumber(numero);
  if (!num) return false;
  const r = db.prepare('UPDATE venty_wa_hilos SET opt_out = 1 WHERE user_id = ? AND wa_numero = ?').run(userId, num);
  return (r && r.changes > 0);
}

// Envío de texto libre por lead. Puertas en orden, todas fail-closed:
//  1. conexión whatsapp viva (venty-conexiones) · 2. hilo sin opt-out ·
//  3. cupo del gobernador · 4. credencial por cliente presente.
// opts: { fetchImpl, vault, conexiones } — conexiones es el módulo
// venty-conexiones (inyectable en tests); por defecto se require acá.
async function enviarTexto(db, userId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const to = normalizeWaNumber(o.to);
  if (!to) return { ok: false, error: 'sin_numero' };
  const texto = String(o.texto || '').trim();
  if (!texto) return { ok: false, error: 'sin_texto' };
  if (texto.length > 4000) return { ok: false, error: 'texto_muy_largo' };
  const conexiones = o.conexiones || require('./venty-conexiones');
  const estado = conexiones.estadoCanal(db, userId, 'whatsapp');
  if (!estado || !estado.viva) return { ok: false, error: 'whatsapp_no_conectado' };
  const hilo = obtenerHilo(db, userId, to, o.leadId || null);
  if (hilo && hilo.opt_out) return { ok: false, error: 'opt_out' };
  const permiso = gobernador.pedirPermiso(db, userId, 'whatsapp', 1, 'wa texto lead ' + to.slice(-4));
  if (!permiso.permitido) return { ok: false, error: 'cupo_diario_agotado', cupo: permiso };
  const cred = resolverCredencial(estado.credencial_ref, o.vault);
  if (!cred.token || !cred.phoneNumberId) {
    gobernador.devolverConsumo(db, userId, 'whatsapp', 1, 'sin credencial por cliente');
    return { ok: false, error: 'sin_credencial_cliente' };
  }
  const url = `https://graph.facebook.com/${API_VERSION}/${cred.phoneNumberId}/messages`;
  const fetchImpl = o.fetchImpl || fetch;
  let data = {};
  let resOk = false;
  let status = 0;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cred.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: texto } }),
      signal: AbortSignal.timeout(15000),
    });
    status = res.status;
    resOk = res.ok;
    try { data = await res.json(); } catch (e) { data = {}; }
  } catch (e) {
    gobernador.devolverConsumo(db, userId, 'whatsapp', 1, 'error de red');
    return { ok: false, error: 'fetch_failed' };
  }
  if (!resOk) {
    gobernador.devolverConsumo(db, userId, 'whatsapp', 1, 'proveedor HTTP ' + status);
    const err = (data && data.error && (data.error.message || JSON.stringify(data.error))) || ('http_' + status);
    return { ok: false, error: String(err).slice(0, 300) };
  }
  const providerId = (data && data.messages && data.messages[0] && data.messages[0].id) || '';
  db.prepare(`INSERT INTO venty_wa_mensajes (hilo_id, direccion, texto, provider_id, estado, created_at) VALUES (?,?,?,?,?,?)`)
    .run(hilo.id, 'saliente', texto.slice(0, 4000), providerId, 'sent', ahoraIso());
  db.prepare('UPDATE venty_wa_hilos SET ultimo_mensaje_at = ? WHERE id = ?').run(ahoraIso(), hilo.id);
  return { ok: true, messageId: providerId, hilo_id: hilo.id };
}

// Recepción del webhook (POST, ya verificado por firma en server.js).
// payload: entry[].changes[].value.{messages[], statuses[], metadata}.
// El dueño se resuelve por metadata.phone_number_id → cuenta_ref de la
// conexión whatsapp. Mensajes desconocidos (sin dueño) se ignoran y se
// cuentan, nunca se inventa un dueño. La baja por texto marca opt-out.
function handleIncomingVenty(db, payload, opts) {
  const o = opts || {};
  ensureSchema(db);
  const conexiones = o.conexiones || require('./venty-conexiones');
  let recibidos = 0;
  let optouts = 0;
  let ignorados = 0;
  try {
    const entries = (payload && payload.entry) || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const phoneId = (v.metadata && v.metadata.phone_number_id) || '';
        const userId = phoneId ? conexiones.resolverDuenoPorCuenta(db, 'whatsapp', phoneId) : null;
        if (!userId) { ignorados += (v.messages || []).length; continue; }
        for (const m of v.messages || []) {
          const text = (m.text && m.text.body) || '';
          const from = normalizeWaNumber(m.from || '');
          if (!from) { ignorados++; continue; }
          if (/^\s*(baja|stop|salir|unsubscribe)\s*!?\s*$/i.test(text)) {
            const hilo = obtenerHilo(db, userId, from, null);
            if (hilo) { db.prepare('UPDATE venty_wa_hilos SET opt_out = 1 WHERE id = ?').run(hilo.id); optouts++; }
            recibidos++;
            continue;
          }
          const hilo = obtenerHilo(db, userId, from, null);
          const ya = m.id ? db.prepare('SELECT id FROM venty_wa_mensajes WHERE provider_id = ? AND hilo_id = ?').get(m.id, hilo.id) : null;
          if (ya) continue;
          db.prepare(`INSERT INTO venty_wa_mensajes (hilo_id, direccion, texto, provider_id, estado, created_at) VALUES (?,?,?,?,?,?)`)
            .run(hilo.id, 'entrante', String(text).slice(0, 4000), m.id || '', 'received', ahoraIso());
          db.prepare('UPDATE venty_wa_hilos SET ultimo_mensaje_at = ? WHERE id = ?').run(ahoraIso(), hilo.id);
          recibidos++;
        }
      }
    }
  } catch (e) { /* una entrada rota no tumba el webhook */ }
  return { recibidos, optouts, ignorados };
}

module.exports = {
  ensureSchema, resolverCredencial, obtenerHilo, listarHilos, listarMensajes,
  marcarOptOut, enviarTexto, handleIncomingVenty,
  verifyWebhook: whatsappGlobal.verifyWebhook,
  verifySignature: whatsappGlobal.verifySignature,
};
