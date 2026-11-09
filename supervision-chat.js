// supervision-chat.js — SUPERVISIÓN DEL CHAT DE POSTY (bamboo detrás de Posty).
// Decisión de Valentino 23:38: SIEMPRE, PARA TODOS LOS CLIENTES. Cuando un
// cliente le escribe a Posty en la app, bamboo toma responsabilidad de esa
// conversación: lee el chat, le dice a Posty qué responder y recién ahí
// Posty responde. Refinamiento 23:40: el cliente PIENSA que chatea con
// Posty — la cara es Posty, la cabeza es bamboo; nada en la superficie
// delata a bamboo (misma voz minúscula, misma cara, mismo «en línea»).
//
// Reglas del módulo:
// - La puerta (puerta) es lo único que corre en el camino caliente del chat.
//   Guarda la fila `user` + la fila del acuse y abre/adjunta el ítem, todo
//   en UNA transacción: si algo falla, no queda nada a medias y el llamador
//   sigue con el cerebro (fail-open) — el cliente nunca queda sin chat.
// - El acuse es el texto fijo de conserje (CONCIERGE_ACK): un recibo, no una
//   respuesta. Es el ÚNICO texto que sale sin dictado de bamboo.
// - El dictado envía el texto exacto COMO Posty (replyAsPosty: fila
//   `assistant` en chat_messages + registro responder_chat). El dictado
//   manda TEXTO, no ejecuta acciones: si el cliente pidió una acción
//   (aprobar, publicar, cambiar día), bamboo la ejecuta por las vías de
//   operador existentes; el texto dictado nunca debe afirmar una acción
//   que no se hizo.
// - El aviso en vivo es fire-and-forget a SUPERVISION_HOOK_URL (si no está
//   configurada, no-op). Nunca bloquea ni lanza.
// - SUPERVISION_OFF=1 saltea la puerta (SOLO para las suites que prueban el
//   cerebro; en producción nunca se configura — la puerta es incondicional).
'use strict';

const supportCases = require('./support-cases');

const ACK = supportCases.CONCIERGE_ACK;
const ACK_FALLBACK = 'dale, ya lo vi 😄 te lo reviso y te escribo en un rato.';

function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS supervision_pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_msg_id INTEGER,
    texto TEXT NOT NULL DEFAULT '',
    mensajes INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    draft_text TEXT,
    draft_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    dictado_por TEXT,
    dictado_at TEXT,
    reply_msg_id INTEGER,
    caso_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_supervision_estado ON supervision_pendientes(estado, created_at);
  CREATE INDEX IF NOT EXISTS idx_supervision_usuario ON supervision_pendientes(user_id, estado);`);
}

function abiertoDe(db, uid) {
  return safe(() => db.prepare(
    `SELECT * FROM supervision_pendientes WHERE user_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1`
  ).get(Number(uid)), null);
}

// Abre o adjunta el ítem de supervisión de un usuario (un ítem abierto por
// usuario; un mensaje nuevo con ítem abierto lo actualiza, no duplica).
function abrirOAdjuntar(db, userId, userMsgId, texto) {
  const uid = Number(userId);
  const txt = trunc(String(texto || '').trim(), 2000);
  if (!uid || !txt) return { ok: false, error: !uid ? 'sin_usuario' : 'texto_vacio' };
  const abierto = abiertoDe(db, uid);
  if (abierto) {
    db.prepare(
      `UPDATE supervision_pendientes SET user_msg_id = ?, texto = ?, mensajes = mensajes + 1, updated_at = datetime('now') WHERE id = ?`
    ).run(userMsgId || abierto.user_msg_id, txt, abierto.id);
    return { ok: true, exchange_id: abierto.id, creado: false, texto: txt };
  }
  const r = db.prepare(
    `INSERT INTO supervision_pendientes (user_id, user_msg_id, texto) VALUES (?,?,?)`
  ).run(uid, userMsgId || null, txt);
  return { ok: true, exchange_id: Number(r.lastInsertRowid), creado: true, texto: txt };
}

function setCaso(db, exchangeId, casoId) {
  try {
    db.prepare(
      `UPDATE supervision_pendientes SET caso_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(Number(casoId), Number(exchangeId));
    return true;
  } catch (e) { return false; }
}

// Aviso en vivo (hook). Fire-and-forget; nunca bloquea ni lanza.
function avisar(payload) {
  try {
    const url = process.env.SUPERVISION_HOOK_URL || '';
    if (!url || typeof fetch !== 'function') return;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 2000) : null;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: ctl ? ctl.signal : undefined,
    }).then(() => { if (t) clearTimeout(t); }).catch(() => { if (t) clearTimeout(t); });
  } catch (e) {}
}

// La puerta: guarda la fila `user` + la fila del acuse y abre/adjunta el
// ítem, en una transacción. Devuelve {ok, exchange_id, creado, texto, ack}.
// NUNCA lanza: si algo falla devuelve {ok:false} y el llamador sigue con
// el cerebro (fail-open).
function puerta(db, uid, clean) {
  try {
    const lastUser = (Array.isArray(clean) ? clean : []).filter((m) => m && m.role === 'user').pop();
    const texto = lastUser ? String(lastUser.text || '').slice(0, 3000) : '';
    if (!texto.trim()) return { ok: false, error: 'texto_vacio' };
    const ack = ACK || ACK_FALLBACK;
    // node:sqlite no tiene db.transaction(): transacción manual (mismo
    // idioma que server.js:16051). Si algo falla, no queda ni la fila user
    // ni el acuse ni el ítem a medias.
    db.exec('BEGIN IMMEDIATE');
    let out;
    try {
      const ins = db.prepare(
        'INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)'
      ).run(uid, 'user', texto);
      db.prepare(
        'INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)'
      ).run(uid, 'assistant', ack);
      const it = abrirOAdjuntar(db, uid, Number(ins.lastInsertRowid), texto);
      if (!it.ok) throw new Error(it.error || 'item_fallo');
      out = { userMsgId: Number(ins.lastInsertRowid), exchange: it };
      db.exec('COMMIT');
    } catch (e2) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw e2;
    }
    if (out.exchange.creado) {
      avisar({
        event: 'supervision_pendiente',
        user_id: Number(uid),
        exchange_id: out.exchange.exchange_id,
        texto: out.exchange.texto,
        created_at: new Date().toISOString(),
      });
    }
    return { ok: true, exchange_id: out.exchange.exchange_id, creado: out.exchange.creado, texto: out.exchange.texto, ack };
  } catch (e) {
    return { ok: false, error: 'puerta_fallo' };
  }
}

// Hilo de un usuario para supervisión: mensajes + ítem abierto + cliente.
function leerHilo(db, userId) {
  try { ensureSchema(db); } catch (e) {}
  const uid = Number(userId);
  const user = safe(() => db.prepare('SELECT id, email, client_name FROM users WHERE id = ?').get(uid), null);
  if (!user) return { ok: false, error: 'sin_usuario' };
  const perfil = safe(() => db.prepare('SELECT business_name, ig_username FROM profiles WHERE user_id = ?').get(uid), null);
  const msgs = safe(() => db.prepare(
    `SELECT id, role, text, created_at FROM chat_messages WHERE user_id = ? AND created_at > datetime('now', '-7 days') ORDER BY id DESC LIMIT 60`
  ).all(uid), []).reverse();
  const item = abiertoDe(db, uid);
  return {
    ok: true, user_id: uid, email: user.email || '', client_name: user.client_name || '',
    business_name: (perfil && perfil.business_name) || '', ig_username: (perfil && perfil.ig_username) || '',
    cliente: ((perfil && perfil.business_name) || user.client_name || user.email || ('usuario ' + uid)),
    mensajes: msgs, pendiente: item || null,
  };
}

// Cola: ítems abiertos, más viejo primero. `vencido` (> 5 min) es solo
// visibilidad: nunca dispara una respuesta automática.
function listarPendientes(db) {
  try { ensureSchema(db); } catch (e) {}
  const rows = safe(() => db.prepare(
    `SELECT s.*, u.email, u.client_name, p.business_name, p.ig_username
     FROM supervision_pendientes s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN profiles p ON p.user_id = s.user_id
     WHERE s.estado = 'pendiente' ORDER BY s.created_at ASC, s.id ASC`
  ).all(), []);
  const ahora = Date.now();
  const pendientes = rows.map((r) => {
    const t = Date.parse(String(r.created_at || '').replace(' ', 'T') + 'Z');
    const esperando = Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 1000)) : 0;
    return {
      exchange_id: r.id, user_id: r.user_id, email: r.email || '', client_name: r.client_name || '',
      business_name: r.business_name || '', ig_username: r.ig_username || '',
      ultimo_mensaje: r.texto || '', mensajes: r.mensajes || 1, desde: r.created_at,
      esperando_seg: esperando, vencido: esperando > 300,
      tiene_borrador: !!(r.draft_text && String(r.draft_text).trim()),
      caso_id: r.caso_id || null,
    };
  });
  return { ok: true, generado_en: new Date().toISOString(), pendientes, total: pendientes.length };
}

// Dictado: envía el texto exacto COMO Posty y cierra el ítem. Con
// {usar_borrador:true} envía el draft_text guardado tal cual.
function dictar(db, userId, texto, opts) {
  try { ensureSchema(db); } catch (e) {}
  const o = opts || {};
  const uid = Number(userId);
  if (!uid) return { ok: false, error: 'sin_usuario' };
  const item = abiertoDe(db, uid);
  if (!item) return { ok: false, error: 'sin_pendiente' };
  let text = '';
  if (o.usar_borrador) {
    text = String(item.draft_text || '').trim();
    if (!text) return { ok: false, error: 'sin_borrador' };
  } else {
    text = String(texto || '').trim();
    if (!text) return { ok: false, error: 'texto_vacio' };
  }
  const r = supportCases.replyAsPosty(db, uid, text, { actor: 'bamboo', caseId: item.caso_id || undefined });
  if (!r.ok) return { ok: false, error: r.error || 'envio_fallo' };
  db.prepare(
    `UPDATE supervision_pendientes SET estado = 'respondido', dictado_por = 'bamboo', dictado_at = datetime('now'), reply_msg_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(Number(r.id), item.id);
  return { ok: true, exchange_id: item.id, reply_msg_id: Number(r.id), case_id: r.case_id || null };
}

// Guarda un borrador en el ítem abierto (para aprobar/corregir después).
function guardarBorrador(db, userId, texto) {
  try { ensureSchema(db); } catch (e) {}
  const uid = Number(userId);
  const text = String(texto || '').trim();
  if (!uid) return { ok: false, error: 'sin_usuario' };
  if (!text) return { ok: false, error: 'texto_vacio' };
  const item = abiertoDe(db, uid);
  if (!item) return { ok: false, error: 'sin_pendiente' };
  db.prepare(
    `UPDATE supervision_pendientes SET draft_text = ?, draft_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(text.slice(0, 2000), item.id);
  return { ok: true, exchange_id: item.id };
}

module.exports = {
  ensureSchema, abrirOAdjuntar, setCaso, puerta, leerHilo, listarPendientes, dictar, guardarBorrador,
  ACK: ACK || ACK_FALLBACK,
  ACK_USUARIO: ACK || ACK_FALLBACK,
};
