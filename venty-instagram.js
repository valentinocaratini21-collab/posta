// venty-instagram.js — VENTY-CONECTAR-4: webhook de Instagram + DM por zona.
// Hasta este lote Instagram era solo polling (insights.syncDMs) con
// aprobación humana en community.js / dm_queue (Posty). Acá Venty suma:
//   · webhook /api/webhooks/instagram (verificación + recepción, mismo
//     patrón que el webhook de WhatsApp: GET con hub.challenge, POST con
//     firma X-Hub-Signature-256 HMAC-SHA256 — se reutiliza
//     server/whatsapp.js verifyWebhook/verifySignature);
//   · hilos por remitente de Instagram (venty_ig_hilos / venty_ig_mensajes),
//     con la respuesta propuesta como jugada en la Bandeja de Venty
//     (espejo + aprobación del dueño, como todo envío real);
//   · envío con remitente por zona: la identidad remitente vive en
//     venty_representantes (nombre + tono de la zona); el transporte es
//     insights.sendDM (la cuenta de IG conectada es una por negocio) y el
//     texto lleva la voz de la zona (validarVoz de venty.js).
//
// PENDIENTE DE META (no cerrable desde acá, ver STATUS.md):
// instagram_manage_messages necesita app review. Sin ese permiso el
// webhook llega pero Graph no entrega mensajes y sendDM falla con error de
// permiso: el error queda registrado y el DM queda en Bandeja como
// «falta el permiso», nunca se promete lo que no hay.
'use strict';

const whatsappGlobal = require('./server/whatsapp');
const gobernador = require('./venty-gobernador');

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_ig_hilos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    zona_id INTEGER,
    ig_sender_id TEXT NOT NULL DEFAULT '',
    ig_username TEXT NOT NULL DEFAULT '',
    ig_conversation_id TEXT NOT NULL DEFAULT '',
    ultimo_mensaje_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, ig_sender_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS venty_ig_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hilo_id INTEGER NOT NULL,
    direccion TEXT NOT NULL DEFAULT '',
    texto TEXT NOT NULL DEFAULT '',
    ig_message_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_ig_msg_hilo ON venty_ig_mensajes(hilo_id, created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_ig_msg_mid ON venty_ig_mensajes(ig_message_id)');
}

// Verificación GET del webhook: el token es INSTAGRAM_VERIFY_TOKEN (env).
// Se reutiliza la lógica de WhatsApp pasándole un env sintético.
function verifyWebhookGet(query) {
  const q = query || {};
  return whatsappGlobal.verifyWebhook(q['hub.mode'], q['hub.verify_token'], q['hub.challenge'],
    { WHATSAPP_VERIFY_TOKEN: process.env.INSTAGRAM_VERIFY_TOKEN || '' });
}

function verifySignature(appSecret, rawBody, signature) {
  return whatsappGlobal.verifySignature(appSecret, rawBody, signature);
}

// Recepción POST del webhook de Instagram.
// Formato Meta (messaging): entry[].messaging[] con sender.id,
// recipient.id (la cuenta de IG del negocio), message.{mid, text}.
// El dueño se resuelve por recipient.id → cuenta_ref de la conexión
// instagram. Cada mensaje nuevo crea/actualiza su hilo y deja una jugada
// en la Bandeja de Venty (tipo 'responder_dm', estado pendiente): nada se
// responde solo. opts: { conexiones, venty } inyectables en tests.
function handleWebhook(db, payload, opts) {
  const o = opts || {};
  ensureSchema(db);
  const conexiones = o.conexiones || require('./venty-conexiones');
  const venty = o.venty || require('./venty');
  let recibidos = 0;
  let jugadas = 0;
  let ignorados = 0;
  try {
    const entries = (payload && payload.entry) || [];
    for (const entry of entries) {
      const eventos = entry.messaging || [];
      for (const ev of eventos) {
        const senderId = String((ev.sender && ev.sender.id) || '');
        const recipientId = String((ev.recipient && ev.recipient.id) || '');
        const msg = ev.message || {};
        const texto = String(msg.text || '').trim();
        if (!senderId || !recipientId || !texto) { ignorados++; continue; }
        // Echos (mensajes que mandó el propio negocio) no son entrantes.
        if (msg.is_echo) { ignorados++; continue; }
        const userId = conexiones.resolverDuenoPorCuenta(db, 'instagram', recipientId);
        if (!userId) { ignorados++; continue; }
        let hilo = db.prepare('SELECT * FROM venty_ig_hilos WHERE user_id = ? AND ig_sender_id = ?').get(userId, senderId);
        if (!hilo) {
          const r = db.prepare(`INSERT INTO venty_ig_hilos (user_id, ig_sender_id, ig_username, ig_conversation_id, created_at) VALUES (?,?,?,?,?)`)
            .run(userId, senderId, '', '', ahoraIso());
          hilo = db.prepare('SELECT * FROM venty_ig_hilos WHERE id = ?').get(Number(r.lastInsertRowid));
        }
        const ya = msg.mid ? db.prepare('SELECT id FROM venty_ig_mensajes WHERE ig_message_id = ? AND hilo_id = ?').get(msg.mid, hilo.id) : null;
        if (ya) continue;
        db.prepare(`INSERT INTO venty_ig_mensajes (hilo_id, direccion, texto, ig_message_id, created_at) VALUES (?,?,?,?,?)`)
          .run(hilo.id, 'entrante', texto.slice(0, 1000), msg.mid || '', ahoraIso());
        db.prepare('UPDATE venty_ig_hilos SET ultimo_mensaje_at = ? WHERE id = ?').run(ahoraIso(), hilo.id);
        recibidos++;
        // Jugada en Bandeja: responder este DM (con remitente por zona si
        // el hilo ya tiene zona; si no, la zona se asigna al aceptar).
        try {
          const rep = hilo.zona_id ? (venty.representanteDeZona ? venty.representanteDeZona(db, userId, hilo.zona_id) : null) : null;
          const propuesta = {
            que: 'responder el DM de ' + (hilo.ig_username || senderId),
            texto_entrante: texto.slice(0, 300),
            hilo_id: hilo.id, ig_sender_id: senderId,
            remitente: rep ? (rep.remitente_nombre || '') : '',
          };
          db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
            .run(userId, null, 'responder_dm', JSON.stringify(propuesta),
              'te escribió por instagram: respondé con tu voz antes de que se enfríe');
          jugadas++;
        } catch (e) { /* la jugada nunca rompe la recepción */ }
      }
    }
  } catch (e) { /* una entrada rota no tumba el webhook */ }
  return { recibidos, jugadas, ignorados };
}

function listarHilos(db, userId) {
  ensureSchema(db);
  return db.prepare(`SELECT h.*, (SELECT texto FROM venty_ig_mensajes WHERE hilo_id = h.id ORDER BY id DESC LIMIT 1) AS ultimo_texto,
    (SELECT COUNT(*) FROM venty_ig_mensajes WHERE hilo_id = h.id) AS mensajes
    FROM venty_ig_hilos h WHERE h.user_id = ? ORDER BY h.ultimo_mensaje_at DESC, h.id DESC`).all(userId);
}

// Envío de un DM con remitente por zona. Puertas fail-closed, en orden:
//  1. jugada aceptada en Bandeja (jugadaId, tipo responder_dm) ·
//  2. conexión instagram viva · 3. voz de Venty válida · 4. cupo.
// El transporte es insights.sendDM (la cuenta conectada es una por
// negocio); la identidad por zona viaja en el texto (firma del
// representante) y en la jugada, no como login separado (Meta no da un
// login de IG por zona). opts: { insights, venty, conexiones }.
async function enviarDM(db, userId, opts) {
  const o = opts || {};
  ensureSchema(db);
  const venty = o.venty || require('./venty');
  const conexiones = o.conexiones || require('./venty-conexiones');
  const jugadaId = Number(o.jugadaId || 0);
  if (!jugadaId) return { ok: false, error: 'sin_jugada' };
  const jugada = db.prepare('SELECT * FROM venty_jugadas WHERE id = ? AND user_id = ?').get(jugadaId, userId);
  if (!jugada) return { ok: false, error: 'jugada_no_encontrada' };
  if (jugada.estado !== 'aceptada') return { ok: false, error: 'jugada_no_aceptada' };
  if (jugada.tipo !== 'responder_dm') return { ok: false, error: 'jugada_tipo_invalido' };
  const propuesta = (() => { try { return JSON.parse(jugada.propuesta_json || '{}'); } catch (e) { return {}; } })();
  const recipientIgId = String(o.recipientIgId || propuesta.ig_sender_id || '');
  if (!recipientIgId) return { ok: false, error: 'sin_destinatario' };
  let texto = String(o.texto || propuesta.texto_respuesta || '').trim();
  if (!texto) return { ok: false, error: 'sin_texto' };
  const voz = venty.validarVoz(texto);
  if (!voz.ok) return { ok: false, error: 'voz_invalida', detalle: voz.errores };
  const estado = conexiones.estadoCanal(db, userId, 'instagram');
  if (!estado || !estado.viva) return { ok: false, error: 'instagram_no_conectado' };
  const permiso = gobernador.pedirPermiso(db, userId, 'instagram', 1, 'ig dm ' + recipientIgId.slice(-6));
  if (!permiso.permitido) return { ok: false, error: 'cupo_diario_agotado', cupo: permiso };
  const insights = o.insights || require('./insights');
  try {
    await insights.sendDM(db, userId, recipientIgId, texto.slice(0, 1000));
  } catch (e) {
    gobernador.devolverConsumo(db, userId, 'instagram', 1, 'sendDM falló');
    const msg = String((e && e.message) || 'send_dm_fallo');
    // SLICE 2 Fitswapp: error de permiso de Meta (sin app review de
    // instagram_manage_messages) → el DM vuelve a la Bandeja como
    // «falta el permiso»: la jugada aceptada vuelve a pendiente con el
    // motivo, nunca se promete un envío que no salió.
    if (/permission|manage_messages|OAuthException|\(#10\)|\(#200\)|\(#190\)/i.test(msg)) {
      try { marcarFaltaPermiso(db, userId, jugadaId, 'falta el permiso instagram_manage_messages (app review de Meta pendiente): el DM quedó en Bandeja, no se prometió el envío'); } catch (_) {}
      return { ok: false, error: 'falta_permiso_instagram', detalle: msg.slice(0, 300) };
    }
    return { ok: false, error: msg.slice(0, 300) };
  }
  const hilo = db.prepare('SELECT * FROM venty_ig_hilos WHERE user_id = ? AND ig_sender_id = ?').get(userId, recipientIgId);
  if (hilo) {
    db.prepare(`INSERT INTO venty_ig_mensajes (hilo_id, direccion, texto, ig_message_id, created_at) VALUES (?,?,?,?,?)`)
      .run(hilo.id, 'saliente', texto.slice(0, 1000), '', ahoraIso());
    db.prepare('UPDATE venty_ig_hilos SET ultimo_mensaje_at = ? WHERE id = ?').run(ahoraIso(), hilo.id);
  }
  try { venty.registrarEvento(db, userId, 'ig_dm_enviado', null, { jugada_id: jugadaId, hilo_id: hilo ? hilo.id : null }); } catch (e) {}
  return { ok: true, hilo_id: hilo ? hilo.id : null };
}

// La jugada aceptada vuelve a pendiente cuando Meta niega el permiso:
// el DM queda en Bandeja con el motivo, nunca se promete lo que no salió.
// (SLICE 2 Fitswapp: sin app review de instagram_manage_messages.)
function marcarFaltaPermiso(db, userId, jugadaId, motivo) {
  ensureSchema(db);
  const venty = require('./venty');
  const j = db.prepare('SELECT * FROM venty_jugadas WHERE id = ? AND user_id = ?').get(jugadaId, userId);
  if (!j) return { ok: false, error: 'jugada_no_encontrada' };
  db.prepare(`UPDATE venty_jugadas SET estado='pendiente', resuelto_at='', resuelto_por='', nota_dueno=? WHERE id=?`)
    .run(String(motivo || 'falta el permiso').slice(0, 300), jugadaId);
  try { venty.registrarEvento(db, userId, 'ig_dm_falta_permiso', j.partida_id, { jugada_id: jugadaId, motivo: String(motivo || '').slice(0, 300) }); } catch (e) {}
  return { ok: true, jugada_id: jugadaId };
}

module.exports = {
  ensureSchema, verifyWebhookGet, verifySignature, handleWebhook,
  listarHilos, enviarDM, marcarFaltaPermiso,
};
