// followups.js — Seguimiento a quien preguntó y NO cerró (Atención al
// cliente, plan Total).
//
// (2026-10-20, build Atención Total) Promesa vendida que no existía: cuando
// una conversación queda sin cierre, Posty vuelve a las 24–48 h con un
// borrador de seguimiento armado por el cerebro de ventas. Anti-spam DURO:
// máximo 2 seguimientos por conversación (a las ~24 h y a las ~48 h de que
// la conversación quedó abierta); si el cliente cierra (compra/reserva) o la
// conversación se descarta, no se sigue nunca más.
//
// El borrador NUNCA se envía solo: queda en la fila para la cola de
// aprobación del dueño, que lo manda con un toque. Es la REGLA FIJA del
// producto (Valentino, 2026-10-20): aprobación humana de cada respuesta en
// todos los planes, sin autopilot (ver payment-close.js, SEND_POLICY).
//
// Estados: open → closed (descartada/respondida por humano)
//                → converted (cerró: compró o reservó)
//                → exhausted (ya tuvo sus 2 seguimientos)
// Exporta: { ensureTable, registerConversation, closeConversation,
//   dueFollowups, recordFollowupSent, draftFollowup, getFollowup,
//   listFollowups, MAX_FOLLOWUPS, FIRST_DELAY_HOURS, SECOND_DELAY_HOURS }
'use strict';

const MAX_FOLLOWUPS = 2;
const FIRST_DELAY_HOURS = 24;   // primer seguimiento: ~24 h sin cierre
const SECOND_DELAY_HOURS = 24;  // segundo: ~24 h después del primero (~48 h)

function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source TEXT DEFAULT 'dm',
      conversation_key TEXT NOT NULL,
      customer_username TEXT DEFAULT '',
      customer_name TEXT DEFAULT '',
      topic TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      followup_count INTEGER DEFAULT 0,
      next_due_at TEXT DEFAULT '',
      last_followup_at TEXT DEFAULT '',
      last_draft TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, conversation_key)
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(user_id, status, next_due_at)`);
  } catch (e) { /* defensivo, mismo patrón que client-digest.ensureTable */ }
}

function isoPlusHours(base, hours) {
  return new Date(new Date(base).getTime() + hours * 3600000).toISOString();
}

// Registra (o refresca) una conversación que quedó abierta sin cierre.
// El reloj arranca cuando la conversación queda sin respuesta del negocio:
// primer seguimiento a las 24 h. Si la conversación ya estaba abierta, se
// actualiza el tema SIN resetear el contador (anti-spam).
function registerConversation(db, userId, data, opts) {
  ensureTable(db);
  const d = data || {};
  const key = String(d.conversationKey || d.conversation_key || '').trim();
  if (!key) throw new Error('la conversación necesita conversation_key');
  const now = (opts && opts.now) ? new Date(opts.now) : new Date();
  const existing = db.prepare(
    'SELECT * FROM followups WHERE user_id = ? AND conversation_key = ?'
  ).get(userId, key);
  if (existing) {
    if (existing.status === 'open') {
      db.prepare(
        `UPDATE followups SET topic = ?, customer_username = ?, customer_name = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        String(d.topic || existing.topic || '').slice(0, 300), String(d.username || d.customerUsername || existing.customer_username || '').slice(0, 120),
        String(d.customerName || existing.customer_name || '').slice(0, 120), existing.id
      );
    }
    return getFollowup(db, existing.id, userId);
  }
  const ins = db.prepare(
    `INSERT INTO followups (user_id, source, conversation_key, customer_username, customer_name, topic, status, followup_count, next_due_at)
     VALUES (?,?,?,?,?,?, 'open', 0, ?)`
  ).run(
    userId,
    String(d.source || 'dm').slice(0, 24),
    key,
    String(d.username || d.customerUsername || '').slice(0, 120),
    String(d.customerName || '').slice(0, 120),
    String(d.topic || '').slice(0, 300),
    isoPlusHours(now, FIRST_DELAY_HOURS)
  );
  return getFollowup(db, Number(ins.lastInsertRowid), userId);
}

function getFollowup(db, id, userId) {
  ensureTable(db);
  return db.prepare('SELECT * FROM followups WHERE id = ? AND user_id = ?').get(id, userId) || null;
}

function listFollowups(db, userId, opts) {
  ensureTable(db);
  const o = opts || {};
  const where = ['user_id = ?'];
  const args = [userId];
  if (o.status) { where.push('status = ?'); args.push(String(o.status)); }
  const limit = Math.min(Math.max(Number(o.limit || 100), 1), 500);
  return db.prepare(
    `SELECT * FROM followups WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`
  ).all(...args, limit);
}

// La conversación cerró (o se descarta): nunca más seguimientos.
function closeConversation(db, userId, conversationKey, opts) {
  ensureTable(db);
  const status = (opts && opts.converted) ? 'converted' : 'closed';
  const r = db.prepare(
    `UPDATE followups SET status = ?, next_due_at = '', updated_at = datetime('now')
     WHERE user_id = ? AND conversation_key = ? AND status = 'open'`
  ).run(status, userId, String(conversationKey || ''));
  return { ok: Number(r.changes) > 0, status };
}

// Conversaciones abiertas cuyo seguimiento ya venció y que todavía están
// bajo el tope anti-spam.
function dueFollowups(db, userId, now) {
  ensureTable(db);
  const at = (now ? new Date(now) : new Date()).toISOString();
  return db.prepare(
    `SELECT * FROM followups WHERE user_id = ? AND status = 'open'
       AND followup_count < ? AND next_due_at != '' AND next_due_at <= ?
     ORDER BY next_due_at ASC`
  ).all(userId, MAX_FOLLOWUPS, at);
}

// Registra que un seguimiento salió (o quedó aprobado para salir): sube el
// contador, agenda el siguiente a +24 h o agota la conversación al llegar
// al tope de 2.
function recordFollowupSent(db, userId, followupId, opts) {
  ensureTable(db);
  const o = opts || {};
  const row = getFollowup(db, followupId, userId);
  if (!row) throw new Error('seguimiento no encontrado');
  if (row.status !== 'open') throw new Error(`la conversación está '${row.status}': no se sigue más`);
  if (Number(row.followup_count || 0) >= MAX_FOLLOWUPS) throw new Error('tope de seguimientos alcanzado');
  const at = o.now ? new Date(o.now) : new Date();
  const count = Number(row.followup_count || 0) + 1;
  const exhausted = count >= MAX_FOLLOWUPS;
  db.prepare(
    `UPDATE followups SET followup_count = ?, last_followup_at = ?, last_draft = ?,
       next_due_at = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(
    count, at.toISOString(), String(o.draft || '').slice(0, 500),
    exhausted ? '' : isoPlusHours(at, SECOND_DELAY_HOURS),
    exhausted ? 'exhausted' : 'open',
    followupId, userId
  );
  return getFollowup(db, followupId, userId);
}

// ---------------------------------------------------------------------------
// Borrador de seguimiento (cerebro de ventas).
// aiFn({system, user}) inyectable (tests) — mismo patrón que community.js.
// Sin IA, cae a una plantilla determinística que usa SOLO datos reales del
// fundamento (servicio/precio estrella) — nunca inventa.
// ---------------------------------------------------------------------------
function fallbackDraft({ customerName, topic, facts, attempt, lang }) {
  const nombre = String(customerName || '').trim().split(' ')[0];
  const priced = [...(facts && facts.services || []), ...(facts && facts.products || [])].find((x) => x && x.precio);
  const tema = String(topic || '').trim();
  // Espejo EN según el idioma de la cuenta (cableado 2026-10-21).
  if (lang === 'en') {
    const hi = nombre ? `Hi ${nombre}!` : 'Hi there!';
    if (attempt >= 2) {
      return `${hi} Last little message from us 🙌 If you ever need ${tema ? `help with ${tema}` : 'a hand'}, just write us and we will sort it out right away. Thanks for your time!`.slice(0, 300);
    }
    if (priced) {
      return `${hi} Did you get a chance to see the ${priced.nombre}? It is ${priced.precio}. If you want, we can hold it for you today 🙌`.slice(0, 300);
    }
    if (tema) {
      return `${hi} We left things pending on ${tema}. Shall we pick it back up? We can sort it out right away 🙌`.slice(0, 300);
    }
    return `${hi} You wrote to us yesterday and we did not finish your question. Shall we continue here? We reply right away 🙌`.slice(0, 300);
  }
  const saludo = nombre ? `¡Hola ${nombre}!` : '¡Hola!';
  if (attempt >= 2) {
    return `${saludo} Último mensajito por acá 🙌 Si más adelante necesitás ${tema ? `lo de ${tema}` : 'una mano'}, escribinos y lo vemos al toque. ¡Gracias por tu tiempo!`.slice(0, 300);
  }
  if (priced) {
    return `${saludo} ¿Pudiste ver lo de ${priced.nombre}? Quedó a ${priced.precio}. Si querés, te lo dejamos reservado hoy mismo 🙌`.slice(0, 300);
  }
  if (tema) {
    return `${saludo} Quedamos en pausa con lo de ${tema}. ¿Seguimos? Te lo resolvemos en el momento 🙌`.slice(0, 300);
  }
  return `${saludo} Ayer nos escribiste y no llegamos a cerrar tu consulta. ¿Seguimos por acá? Te respondemos al toque 🙌`.slice(0, 300);
}

async function draftFollowup(opts) {
  const o = opts || {};
  let facts = { services: [], products: [], promos: [] };
  let block = '';
  try {
    // Lazy: generator.js es pesado y esto evita cualquier ciclo de require.
    const gen = require('./generator');
    facts = gen.foundationFacts(o.fundamento || null, o.horarios || '');
    block = gen.foundationBlock(facts);
  } catch (e) { /* sin fundamento usable: plantilla genérica honesta */ }
  const attempt = Number(o.attempt || 1);
  if (o.aiFn) {
    try {
      const system = o.lang === 'en'
        ? 'You are Posty, the community manager and salesperson for "' + (o.business || 'a business') + '". ' +
          'Write ONE short follow-up message (max 280 characters, warm, no pressure) ' +
          'to a customer who asked something and did not close. Goal: restart the conversation and move toward the close. ' +
          'HARD RULES: only data from the real-data block; NEVER invent prices, stock or promos. ' +
          'No asterisks or formatting. Reply ONLY with the message.' +
          (block ? '\nREAL BUSINESS DATA:\n' + block : '')
        : 'Sos Posty, el community manager y vendedor de "' + (o.business || 'un negocio') + '". ' +
        'Escribís UN mensaje corto de seguimiento (máx 280 caracteres, español rioplatense, cálido, sin presionar) ' +
        'a un cliente que preguntó y no cerró. Objetivo: retomar la conversación y acercar el cierre. ' +
        'REGLAS DURAS: solo datos del bloque de datos reales; NUNCA inventes precios, stock ni promos. ' +
        'Sin asteriscos ni formato. Respondé SOLO el mensaje.' +
        (block ? '\nDATOS REALES DEL NEGOCIO:\n' + block : '');
      const user = `El cliente ${o.customerName || ''} (@${o.username || ''}) había preguntado: "${String(o.topic || '').slice(0, 200)}". Este es el seguimiento número ${attempt} de 2 como máximo.`;
      const txt = String(await o.aiFn({ system, user }) || '').trim().replace(/^["'«»]+|["'«»]+$/g, '');
      if (txt) return { draft: txt.slice(0, 300), via: 'ai' };
    } catch (e) { /* cae a plantilla */ }
  }
  return { draft: fallbackDraft({ customerName: o.customerName, topic: o.topic, facts, attempt, lang: o.lang }), via: 'template' };
}

module.exports = {
  ensureTable, registerConversation, closeConversation, dueFollowups,
  recordFollowupSent, draftFollowup, getFollowup, listFollowups,
  MAX_FOLLOWUPS, FIRST_DELAY_HOURS, SECOND_DELAY_HOURS,
};
