// venty-ingesta-buzon.js — SLICE 4: ruta de ingesta de buzón autenticada.
// Es la infraestructura que el slice 2 dejó pendiente: el worker que
// reciba el correo entrante (en ventysalesmanager.com o en el dominio del
// negocio) postea cada email a POST /api/venty/email/ingesta y esta pieza
// lo mete al loop de venty: registrarIngesta() de venty-email.js +
// partida (hilo) + jugada en Bandeja, igual que los otros canales.
//
// Autenticación: secreto compartido en la variable de entorno
// VENTY_INGESTA_SECRET (NUNCA hardcodeado; el header es
// x-venty-ingesta-secret). Comparación en tiempo constante sobre el
// sha256 de ambos lados. SIN secreto configurado la ruta queda CERRADA
// (503): la ingesta nunca queda abierta por omisión.
//
// Opt-out: si el email pide la baja, la supresión es inmediata y queda
// registrada (venty-email.suprimir); no se crea jugada de respuesta.
'use strict';

const crypto = require('crypto');

const ENV_SECRET = 'VENTY_INGESTA_SECRET';
const HEADER_SECRET = 'x-venty-ingesta-secret';

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_s4_ingesta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message_id TEXT NOT NULL DEFAULT '',
    de TEXT NOT NULL DEFAULT '',
    asunto TEXT NOT NULL DEFAULT '',
    ingesta_id INTEGER,
    partida_id INTEGER,
    jugada_id INTEGER,
    resultado TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(message_id)
  )`);
}

// Verificación del secreto compartido. Sin secreto en el entorno:
// cerrada. Con secreto: comparación en tiempo constante (sha256 de ambos
// lados, longitudes siempre iguales).
function verificarSecreto(headers) {
  const esperado = process.env[ENV_SECRET] || '';
  if (!esperado) return { ok: false, error: 'ingesta_cerrada', detalle: 'sin secreto de ingesta configurado la ruta queda cerrada' };
  const recibido = String((headers && (headers[HEADER_SECRET] || headers['X-Venty-Ingesta-Secret'])) || '');
  if (!recibido) return { ok: false, error: 'sin_secreto' };
  const a = Buffer.from(sha256Hex(recibido));
  const b = Buffer.from(sha256Hex(esperado));
  const igual = a.length === b.length && crypto.timingSafeEqual(a, b);
  return igual ? { ok: true } : { ok: false, error: 'secreto_incorrecto' };
}

const PALABRAS_BAJA = ['darme de baja', 'darse de baja', 'unsubscribe', 'no me escriban', 'no me manden', 'dejen de escribir', 'baja de la lista', 'opt out', 'opt-out'];
function esBaja(texto) {
  const t = String(texto || '').toLowerCase();
  return PALABRAS_BAJA.some((p) => t.includes(p));
}

function tokenDeDireccion(para) {
  const m = String(para || '').match(/venty\+([0-9a-fA-F]+)@/);
  return m ? m[1] : '';
}

// Procesa un email entrante ya autenticado. payload:
//   { de, para, asunto, cuerpo, message_id }
// El dueño se resuelve por el token de la dirección de reenvío
// (venty-email.resolverToken). Sin match: la ingesta queda registrada
// sin dueño (user_id null) y no crea hilo ni jugada. Con match:
// registrarIngesta + partida de email (hilo) + mensaje entrante +
// jugada 'responder_email' pendiente en Bandeja. Idempotente por
// message_id. opts: { ventyEmail, venty } inyectables en tests.
function procesarIngesta(db, payload, opts) {
  const o = opts || {};
  ensureSchema(db);
  const ventyEmail = o.ventyEmail || require('./venty-email');
  const venty = o.venty || require('./venty');
  const p = payload || {};
  const de = String(p.de || '').trim().toLowerCase().slice(0, 200);
  const asunto = String(p.asunto || '').slice(0, 200);
  const cuerpo = String(p.cuerpo || '').slice(0, 4000);
  const messageId = String(p.message_id || p.messageId || '').slice(0, 200);
  if (!de || !ventyEmail.emailValido(de)) return { ok: false, error: 'remitente_invalido' };
  if (messageId) {
    const ya = db.prepare('SELECT * FROM venty_s4_ingesta WHERE message_id = ?').get(messageId);
    if (ya) return { ok: true, duplicada: true, ingesta_id: ya.ingesta_id, partida_id: ya.partida_id, jugada_id: ya.jugada_id };
  }
  const token = tokenDeDireccion(p.para || p.to || '');
  const userId = token ? ventyEmail.resolverToken(db, token) : null;
  const huellaCorta = token ? sha256Hex(token.toLowerCase()).slice(0, 8) : '';
  const ingestaId = ventyEmail.registrarIngesta(db, userId, { huella_corta: huellaCorta, de, asunto, estado: 'recibida' });
  if (!userId) {
    db.prepare(`INSERT INTO venty_s4_ingesta (user_id, message_id, de, asunto, ingesta_id, resultado, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(null, messageId, de, asunto, ingestaId, 'sin_dueno', ahoraIso());
    return { ok: true, sin_dueno: true, ingesta_id: ingestaId };
  }
  // opt-out inmediato y registrado: no se crea jugada de respuesta.
  if (esBaja(asunto + ' ' + cuerpo)) {
    try { ventyEmail.suprimir(db, userId, de, 'baja_por_ingesta'); } catch (e) {}
    db.prepare('UPDATE venty_email_ingestas SET estado = ? WHERE id = ?').run('baja_registrada', ingestaId);
    try { venty.registrarEvento(db, userId, 'email_baja_ingesta', null, { de, ingesta_id: ingestaId }); } catch (e) {}
    db.prepare(`INSERT INTO venty_s4_ingesta (user_id, message_id, de, asunto, ingesta_id, resultado, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(userId, messageId, de, asunto, ingestaId, 'baja_registrada', ahoraIso());
    return { ok: true, baja: true, ingesta_id: ingestaId };
  }
  const ahora = ahoraIso();
  const lead = db.prepare('SELECT * FROM venty_leads WHERE user_id = ? AND lower(contacto_ref) = ?').get(userId, de) || null;
  const nombreHilo = (lead && lead.nombre) || de;
  const rp = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(userId, nombreHilo, 'email', 'viva', '', 0, '', '', 0, '', 'email_respuesta', ahora, ahora);
  const partidaId = Number(rp.lastInsertRowid);
  db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`)
    .run(partidaId, 'cliente', (asunto ? asunto + ' — ' : '') + cuerpo.slice(0, 1000), 'email', ahora, '');
  const rj = db.prepare(`INSERT INTO venty_jugadas (user_id, partida_id, tipo, propuesta_json, porque, estado) VALUES (?,?,?,?,?,'pendiente')`)
    .run(userId, partidaId, 'responder_email', JSON.stringify({
      que: 'responder el email de ' + nombreHilo, de, asunto, ingesta_id: ingestaId, lead_id: lead ? lead.id : null,
    }), 'te respondieron por email: la respuesta entra al hilo y se propone en la bandeja, como en los otros canales');
  const jugadaId = Number(rj.lastInsertRowid);
  try { venty.registrarEvento(db, userId, 'email_respuesta_ingesta', partidaId, { ingesta_id: ingestaId, jugada_id: jugadaId }); } catch (e) {}
  db.prepare(`INSERT INTO venty_s4_ingesta (user_id, message_id, de, asunto, ingesta_id, partida_id, jugada_id, resultado, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(userId, messageId, de, asunto, ingestaId, partidaId, jugadaId, 'hilo_y_jugada', ahoraIso());
  return { ok: true, ingesta_id: ingestaId, partida_id: partidaId, jugada_id: jugadaId };
}

module.exports = { ENV_SECRET, HEADER_SECRET, ensureSchema, verificarSecreto, esBaja, tokenDeDireccion, procesarIngesta };
