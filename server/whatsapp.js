'use strict';
// ---------- WhatsApp Business (Cloud API) — carta dominical + aprobación con un toque ----------
// Transporte, no lógica nueva de aprobación: el link que viaja es la landing
// /aprobar/:token que ya existe (approval.signApproveWeekLink, TTL 72 h).
// La semana se aprueba con UN TOQUE desde WhatsApp, sin abrir la app: el
// botón CTA de la plantilla abre la landing en el navegador.
//
// GATEADO fail-closed (tanda whatsapp-aprobacion, spec base:
// ~/workspace/arma-todo/item5/whatsapp-business-spec.md):
//   - Sin WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID: enabled() = false y
//     TODAS las funciones de envío devuelven { skipped: 'disabled' } sin
//     tocar la red ni prometer nada. El opt-in en Ajustes sí se puede
//     guardar (gate 4 de la spec, independiente de los gates 1-3), y la UI
//     lo muestra como "todavía no encendido" mientras el server no lo esté.
//   - Sin WHATSAPP_VERIFY_TOKEN / WHATSAPP_APP_SECRET: el webhook devuelve
//     403 (nada registrado en Meta puede pegarle sin esos secretos).
//   - Sin plantilla aprobada en Meta: Graph devuelve error, queda logueado
//     en whatsapp_send_log como failed y NADA se rompe ni se reintenta.
//   - Sin semana aprobable (sin borradores pendientes): NO se manda el
//     mensaje (regla de verdad: el botón no puede prometer lo que no hay).
//   - El anti-duplicado es el del sweep dominical (carta nueva en 3 días),
//     el mismo que protege al push — este módulo no inventa otro.
//   - El número dedicado es un paso de Valentino (gate 1 de la spec): acá
//     NO se inventa ningún número; solo llegan por variables de entorno.
//
// La plantilla lleva SOLO el resumen + el botón (spec §3): la carta completa
// y la semana viven en /carta/ y /aprobar/. El {{1}} del cuerpo es el nombre
// del negocio (profiles.business_name) o 'amigo'/'friend' si no hay; el {{1}}
// del botón es el token firmado (los parámetros de botón van por componente
// separado en la Cloud API, no se mezclan con los del cuerpo).
// La base del botón (https://postycommunitymanager.com/aprobar/) vive en la
// plantilla creada en Meta, no en código: el código solo manda el token.

const crypto = require('crypto');

const schemaDone = new WeakMap();

function cfg(env) {
  const e = env || process.env || {};
  return {
    token: e.WHATSAPP_TOKEN || '',
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: e.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: e.WHATSAPP_APP_SECRET || '',
    templateEs: e.WHATSAPP_TEMPLATE_ES || 'carta_semanal',
    templateEn: e.WHATSAPP_TEMPLATE_EN || 'carta_semanal_en',
    langEs: e.WHATSAPP_LANG_ES || 'es_AR',
    langEn: e.WHATSAPP_LANG_EN || 'en_US',
    apiVersion: e.WHATSAPP_API_VERSION || 'v21.0',
  };
}

// Puerta de envío: credenciales presentes. Sin ellas, todo es no-op.
function enabled(env) {
  const c = cfg(env);
  return !!(c.token && c.phoneNumberId);
}

function ensureSchema(db) {
  if (!db) return false;
  if (schemaDone.get(db)) return true;
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      user_id INTEGER,
      to_num TEXT DEFAULT '',
      template TEXT DEFAULT '',
      lang TEXT DEFAULT 'es',
      kind TEXT DEFAULT 'carta',
      status TEXT DEFAULT '',
      provider_id TEXT DEFAULT '',
      error TEXT DEFAULT ''
    )`);
    const cols = ['wa_notify_num TEXT', 'wa_notify_optin_at INTEGER', 'wa_notify_optout_at INTEGER', "wa_notify_src TEXT"];
    for (const col of cols) {
      try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch (e) { /* ya existe */ }
    }
    schemaDone.set(db, true);
    return true;
  } catch (e) {
    return false; // sin esquema no hay envío: fail-closed, nunca se lanza
  }
}

// E.164 sin '+': solo dígitos, 8-15 (mismo rango que el WhatsApp del negocio).
function normalizeWaNumber(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

function maskNumber(num) {
  const n = String(num || '');
  return n ? '••••••' + n.slice(-4) : '';
}

// Enviable = número + opt-in vigente (un opt-out posterior lo apaga).
function isSendable(row) {
  if (!row || !row.wa_notify_num || !row.wa_notify_optin_at) return false;
  if (row.wa_notify_optout_at && row.wa_notify_optout_at >= row.wa_notify_optin_at) return false;
  return true;
}

function readNotifyRow(db, uid) {
  try {
    return db.prepare('SELECT wa_notify_num, wa_notify_optin_at, wa_notify_optout_at FROM users WHERE id = ?').get(uid) || {};
  } catch (e) {
    return {};
  }
}

// Guardado del opt-in (Ajustes). Reglas:
//  - optin true: exige número válido (el del body, o el ya guardado si no
//    viene uno nuevo); sella optin_at=ahora, src='ajustes', limpia optout.
//  - optin false: sella optout_at=ahora (baja inmediata, se guarda número e
//    historial). Nunca borra el número: la baja es un estado, no un olvido.
//  - solo número (sin optin): actualiza el número SIN cambiar el consentimiento
//    (el consentimiento tiene que ser explícito, nunca implícito).
//  - número vacío con optin true y sin número guardado: error, no se guarda nada.
function applyNotifyPrefs(db, uid, body) {
  try {
    ensureSchema(db);
    const b = body || {};
    const row = readNotifyRow(db, uid);
    const stored = row.wa_notify_num || '';
    let num = stored;
    if (b.wa_notify_num !== undefined) {
      const raw = String(b.wa_notify_num || '').trim();
      if (raw === '') {
        if (b.wa_notify_optin === true) return { ok: false, error: 'wa_number_required' };
        num = '';
      } else {
        const n = normalizeWaNumber(raw);
        if (!n) return { ok: false, error: 'wa_number_invalid' };
        num = n;
      }
    }
    const now = Date.now();
    if (b.wa_notify_optin === true) {
      if (!num) return { ok: false, error: 'wa_number_required' };
      db.prepare('UPDATE users SET wa_notify_num = ?, wa_notify_optin_at = ?, wa_notify_optout_at = NULL, wa_notify_src = ? WHERE id = ?')
        .run(num, now, 'ajustes', uid);
      return { ok: true, wa: { number_masked: maskNumber(num), opted_in: true } };
    }
    if (b.wa_notify_optin === false) {
      db.prepare('UPDATE users SET wa_notify_optout_at = ? WHERE id = ?').run(now, uid);
      return { ok: true, wa: { number_masked: maskNumber(num), opted_in: false } };
    }
    if (b.wa_notify_num !== undefined) {
      db.prepare('UPDATE users SET wa_notify_num = ? WHERE id = ?').run(num, uid);
    }
    const after = readNotifyRow(db, uid);
    return { ok: true, wa: { number_masked: maskNumber(after.wa_notify_num || ''), opted_in: isSendable(after) } };
  } catch (e) {
    return { ok: false, error: 'wa_save_failed' };
  }
}

// Estado para GET /api/settings/notify-prefs. Nunca lanza.
function notifyPrefsExtra(db, uid, env) {
  try {
    ensureSchema(db);
    const row = readNotifyRow(db, uid);
    return {
      wa_available: enabled(env),
      wa_number_masked: maskNumber(row.wa_notify_num || ''),
      wa_opted_in: isSendable(row),
    };
  } catch (e) {
    return { wa_available: enabled(env), wa_number_masked: '', wa_opted_in: false };
  }
}

function logSend(db, entry) {
  try {
    db.prepare('INSERT INTO whatsapp_send_log (ts, user_id, to_num, template, lang, kind, status, provider_id, error) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(Date.now(), entry.userId || null, entry.to || '', entry.template || '', entry.lang || 'es', entry.kind || 'carta', entry.status || '', entry.providerId || '', String(entry.error || '').slice(0, 500));
  } catch (e) { /* el log nunca bloquea el envío */ }
}

// Envío crudo de plantilla. fetchImpl inyectable solo para tests.
async function sendTemplate(db, msg, opts) {
  const o = opts || {};
  const c = cfg(o.env);
  if (!c.token || !c.phoneNumberId) return { skipped: 'disabled' };
  const lang = msg.lang === 'en' ? 'en' : 'es';
  const template = lang === 'en' ? c.templateEn : c.templateEs;
  const langCode = lang === 'en' ? c.langEn : c.langEs;
  const url = `https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: msg.to,
    type: 'template',
    template: {
      name: template,
      language: { code: langCode },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: msg.name }] },
        { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: msg.token }] },
      ],
    },
  };
  const fetchImpl = o.fetchImpl || fetch;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* cuerpo no-JSON */ }
    if (!res.ok) {
      const err = (data && data.error && (data.error.message || JSON.stringify(data.error))) || ('http_' + res.status);
      logSend(db, { userId: msg.userId, to: msg.to, template, lang, kind: msg.kind, status: 'failed', error: err });
      return { ok: false, error: String(err).slice(0, 300) };
    }
    const providerId = (data && data.messages && data.messages[0] && data.messages[0].id) || '';
    logSend(db, { userId: msg.userId, to: msg.to, template, lang, kind: msg.kind, status: 'sent', providerId });
    return { ok: true, messageId: providerId };
  } catch (e) {
    logSend(db, { userId: msg.userId, to: msg.to, template, lang, kind: msg.kind, status: 'failed', error: e && e.message });
    return { ok: false, error: String((e && e.message) || 'fetch_failed').slice(0, 300) };
  }
}

// La carta por WhatsApp. approveUrl viene del hook del sweep (server.js) con
// la lógica canónica (cartaApproveWeekInfo + signApproveWeekLink): este módulo
// NO reimplementa la aprobación, solo la transporta.
async function notifySundayLetter(db, uid, opts) {
  const o = opts || {};
  try { ensureSchema(db); } catch (e) { return { ok: false, error: 'schema' }; }
  if (!enabled(o.env)) return { skipped: 'disabled' };
  let row = {};
  try {
    row = db.prepare('SELECT u.wa_notify_num AS wa_notify_num, u.wa_notify_optin_at AS wa_notify_optin_at, u.wa_notify_optout_at AS wa_notify_optout_at, p.business_name AS business_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?').get(uid) || {};
  } catch (e) {
    return { ok: false, error: 'user_read_failed' };
  }
  try { // lang vive en users por ALTER de otra tanda: si falta, default es
    const lr = db.prepare('SELECT lang FROM users WHERE id = ?').get(uid);
    if (lr && lr.lang) row.lang = lr.lang;
  } catch (e) { /* sin columna lang: default es */ }
  if (!isSendable(row)) return { skipped: 'not_opted_in' };
  const token = String(o.approveUrl || '').split('/aprobar/')[1] || '';
  if (!token) return { skipped: 'no_approvable_week' };
  const lang = row.lang === 'en' ? 'en' : 'es';
  const name = (String(row.business_name || '').trim()) || (lang === 'en' ? 'friend' : 'amigo');
  return sendTemplate(db, { userId: uid, to: row.wa_notify_num, lang, name, token, kind: 'carta' }, o);
}

// Verificación del webhook de Meta (GET): devuelve el challenge o null.
function verifyWebhook(mode, token, challenge, env) {
  const c = cfg(env);
  if (mode === 'subscribe' && token && c.verifyToken && token === c.verifyToken && challenge) return String(challenge);
  return null;
}

// Firma X-Hub-Signature-256 de Meta. Sin secreto configurado: siempre false.
function verifySignature(appSecret, rawBody, signature) {
  try {
    if (!appSecret || !signature || rawBody == null) return false;
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

// Entrada del webhook (POST): baja por mensaje + estados de entrega.
// Nunca lanza; lo desconocido se ignora.
function handleIncoming(db, payload) {
  let optouts = 0;
  let statuses = 0;
  try { ensureSchema(db); } catch (e) { /* sin esquema no hay nada que marcar */ }
  try {
    const entries = (payload && payload.entry) || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        for (const m of v.messages || []) {
          const text = (m.text && m.text.body) || '';
          if (/^\s*(baja|stop|salir|unsubscribe)\s*!?\s*$/i.test(text)) {
            const from = normalizeWaNumber(m.from || '');
            if (from) {
              try {
                const r = db.prepare('UPDATE users SET wa_notify_optout_at = ? WHERE wa_notify_num = ?').run(Date.now(), from);
                if (r && r.changes > 0) optouts++;
              } catch (e) { /* sin columna: no se marca */ }
            }
          }
        }
        for (const s of v.statuses || []) {
          const map = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed', undelivered: 'failed' };
          const st = map[s.status];
          if (s.id && st) {
            try {
              const r = db.prepare('UPDATE whatsapp_send_log SET status = ? WHERE provider_id = ?').run(st, s.id);
              if (r && r.changes > 0) statuses++;
            } catch (e) { /* sin log: no se marca */ }
          }
        }
      }
    }
  } catch (e) { /* una entrada rota no tumba el webhook */ }
  return { optouts, statuses };
}

module.exports = {
  enabled,
  ensureSchema,
  normalizeWaNumber,
  maskNumber,
  isSendable,
  applyNotifyPrefs,
  notifyPrefsExtra,
  sendTemplate,
  notifySundayLetter,
  verifyWebhook,
  verifySignature,
  handleIncoming,
};
