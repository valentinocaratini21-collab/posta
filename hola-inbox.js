// hola-inbox.js — Lector de respuestas a hola@ (Frente 4b, 2026-10-23).
//
// Los envíos salientes de Posty (la Carta de /prueba — sendTrialGiftEmail,
// remitente Posty <hola@postyhacetodo.com> — y el toque del fundador a las
// 72 h) reciben respuestas en la casilla hola@. Hasta hoy esas respuestas
// se leían "a mano" (server.js, comentario en /api/trial/gift-email: "la
// respuesta llega a hola@ y la lee la tanda del sistema de email (sin lector
// automático todavía)"). Este módulo ES ese lector, SOLO LECTURA:
//
// · Clasifica cada respuesta: interes / consulta / negativa / otro, con
//   reglas explícitas y auditables (cada match deja su señal en `signals`).
// · Intenta asociarla al envío que responde: 'carta' (Carta de /prueba) o
//   'toque' (toque del fundador), por marcadores textuales y, para la Carta,
//   por remitente contra trial_cache.email (los destinatarios de la Carta).
// · Guarda todo en hola_replies (dedupe por message_key: correr el lector
//   N veces sobre el mismo mensaje crea UNA sola fila).
// · Visible para gestión en GET /api/admin/hola-replies (ADMIN_TOKEN).
//
// LÍMITES DUROS (por diseño, no por configuración):
// · NUNCA envía emails ni respuestas automáticas: este archivo no importa
//   email.js ni conoce la API de Resend de envío.
// · NUNCA activa ni envía el toque del fundador (su envío sigue fail-closed
//   sin RESEND_API_KEY y con su flag de aprobación, en su propio flujo).
// · NUNCA marca mensajes como leídos en la casilla real: el lector trabaja
//   sobre copias (objetos mensaje) que le entrega una FUENTE inyectada.
//
// ACOPLE REAL (resto declarado): el repo no tiene hoy ninguna credencial ni
// cliente de LECTURA de la casilla hola@ (email.js solo ENVÍA vía Resend;
// Resend no expone la bandeja de hola@ en este proyecto). El lector queda
// construido contra la interfaz de fuente de abajo; el acople productivo es
// inyectar una fuente (IMAP/Gmail/Resend Inbound) que devuelva mensajes con
// la forma normalizada, o alimentar la tabla vía el endpoint admin de
// ingesta (POST /api/admin/hola-replies/ingest) desde el sistema que sí lee
// la casilla. pollInbox() sin fuente responde {available:false} honesto.
'use strict';

const crypto = require('crypto');

const CLASSIFICATIONS = ['interes', 'consulta', 'negativa', 'otro'];
const LINK_KINDS = ['carta', 'toque'];

// --- Normalización: minúsculas sin acentos, para que las reglas sean
// estables en ES rioplatense con/sin tildes ("anotame", "¿cuánto sale?").
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function excerptOf(s, n) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 280);
}

// --- Reglas de clasificación (auditables: cada regla tiene id y frases).
// Precedencia: negativa > interes > consulta > otro. La negativa manda
// porque un "no me interesa, ¿cuánto salía?" no es una consulta: es un no.
const RULES = [
  { id: 'neg_no_interesa', cls: 'negativa', phrases: ['no me interesa', 'no estoy interesado', 'not interested'] },
  { id: 'neg_no_gracias', cls: 'negativa', phrases: ['no gracias', 'no, gracias', 'no thank'] },
  { id: 'neg_no_quiero', cls: 'negativa', phrases: ['no quiero', 'no necesito', 'no me escriban', 'no me contacten', 'no vuelvan a'] },
  { id: 'neg_baja', cls: 'negativa', phrases: ['darme de baja', 'denme de baja', 'desuscri', 'unsubscribe', 'remove me', 'stop emails'] },
  { id: 'neg_spam', cls: 'negativa', phrases: ['es spam', 'esto es spam', 'es una estafa', 'dejen de mandar'] },
  { id: 'int_interesa', cls: 'interes', phrases: ['me interesa', 'estoy interesado', 'me interesaria', 'i am interested', "i'm interested"] },
  { id: 'int_quiero', cls: 'interes', phrases: ['quiero probar', 'quiero contratar', 'quiero empezar', 'quiero sumarme', 'quiero activar', 'quiero la prueba', 'quiero posty', 'quiero suscribir', 'i want to'] },
  { id: 'int_anotame', cls: 'interes', phrases: ['anotame', 'anoteme', 'me sumo', 'me anoto', 'quiero arrancar', 'arranquemos', 'empecemos'] },
  { id: 'int_como_empiezo', cls: 'interes', phrases: ['como empiezo', 'como arranco', 'como me sumo', 'how do i start', 'sign me up'] },
  { id: 'con_pregunta_precio', cls: 'consulta', phrases: ['cuanto sale', 'cuanto cuesta', 'cuanto vale', 'que precio', 'cual es el precio', 'how much', 'what is the price'] },
  { id: 'con_como_funciona', cls: 'consulta', phrases: ['como funciona', 'como es el servicio', 'how does it work', 'en que consiste'] },
  { id: 'con_pregunta', cls: 'consulta', phrases: ['una pregunta', 'una consulta', 'una duda', 'queria consultar', 'queria preguntar', 'te consulto', 'te pregunto'] },
  { id: 'con_info', cls: 'consulta', phrases: ['mas informacion', 'mas info', 'me pasas info', 'me cuentan', 'incluye', 'los planes', 'que planes'] },
];

// Clasifica un mensaje {from, subject, body|text}. Devuelve
// {classification, signals[], excerpt}. Pura y determinística: sin IA —
// el proyecto no tiene un clasificador IA de email reutilizable a mano y
// las reglas dejan la señal auditable que el frente pide.
function classifyReply(input) {
  const m = input || {};
  const subject = String(m.subject || '');
  const body = String(m.body || m.text || '');
  const hay = norm(subject + '\n' + body);
  const signals = [];
  const byCls = { negativa: [], interes: [], consulta: [] };
  for (const rule of RULES) {
    if (rule.phrases.some((p) => hay.includes(norm(p)))) {
      signals.push(rule.id);
      byCls[rule.cls].push(rule.id);
    }
  }
  // Señal débil de consulta: pregunta explícita sin intención ni negativa.
  if (hay.includes('?') || hay.includes('¿')) {
    if (!byCls.negativa.length && !byCls.interes.length && !byCls.consulta.length) {
      signals.push('con_signo_pregunta');
      byCls.consulta.push('con_signo_pregunta');
    }
  }
  // "quiero" suelto (sin "no" adelante, que ya capturó negativa): intención.
  if (!byCls.negativa.length && !byCls.interes.length && /\bquiero\b/.test(hay)) {
    signals.push('int_quiero_generico');
    byCls.interes.push('int_quiero_generico');
  }
  let classification = 'otro';
  if (byCls.negativa.length) classification = 'negativa';
  else if (byCls.interes.length) classification = 'interes';
  else if (byCls.consulta.length) classification = 'consulta';
  return { classification, signals, excerpt: excerptOf(body || subject) };
}

// --- Asociación al envío respondido.
// Marcadores textuales primero (el asunto de la Carta es conocido:
// "Tus posteos ya están listos, @…" / "Your posts are ready, @…"; el toque
// del fundador se firma como Valentino/fundador). Sin marcador, el remitente
// contra trial_cache.email identifica destinatarios de la Carta (la Carta
// deja gift_state='sent' y el email del lead en esa tabla).
const CARTA_MARKERS = ['tus posteos ya estan listos', 'your posts are ready', 'ver mi semana completa', 'see my full week', 'carta de posty', 'escucha tu carta', 'listen to your letter'];
const TOQUE_MARKERS = ['valentino', 'fundador', 'founder', 'toque del fundador', 'founder touch'];

function determineLink(db, input) {
  const m = input || {};
  const hay = norm(String(m.subject || '') + '\n' + String(m.body || m.text || ''));
  if (TOQUE_MARKERS.some((p) => hay.includes(norm(p)))) return { linked_kind: 'toque', linked_ref: '' };
  if (CARTA_MARKERS.some((p) => hay.includes(norm(p)))) return { linked_kind: 'carta', linked_ref: '' };
  const from = String(m.from || m.from_email || '').trim().toLowerCase();
  if (db && from) {
    try {
      const row = db.prepare('SELECT ig FROM trial_cache WHERE lower(email) = ?').get(from);
      if (row) return { linked_kind: 'carta', linked_ref: String(row.ig || '') };
    } catch (e) { /* trial_cache puede no existir en DBs de test mínimas */ }
  }
  return { linked_kind: null, linked_ref: '' };
}

// Clave de dedupe: el id del proveedor si viene; si no, hash estable del
// remitente+asunto+fecha+extracto (mismo mensaje releído = misma clave).
function messageKey(input, excerpt) {
  const m = input || {};
  const pid = String(m.id || m.message_id || m.messageId || '').trim();
  if (pid) return 'pid:' + pid.slice(0, 200);
  const raw = [String(m.from || m.from_email || '').toLowerCase(), String(m.subject || ''),
    String(m.received_at || m.date || ''), excerpt || excerptOf(m.body || m.text || '')].join('|');
  return 'sha256:' + crypto.createHash('sha256').update(raw).digest('hex');
}

function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS hola_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_key TEXT NOT NULL UNIQUE,
      from_email TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      received_at TEXT DEFAULT '',
      excerpt TEXT DEFAULT '',
      classification TEXT NOT NULL DEFAULT 'otro',
      signals TEXT DEFAULT '',
      linked_kind TEXT DEFAULT '',
      linked_ref TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hola_replies_cls ON hola_replies(classification, created_at)`);
  } catch (e) { /* defensivo */ }
}

// Ingesta idempotente: clasifica + asocia + guarda. Devuelve conteos.
// No envía nada, no toca la casilla: trabaja sobre las copias recibidas.
function ingestReplies(db, messages) {
  ensureTable(db);
  const list = Array.isArray(messages) ? messages : [];
  let inserted = 0, skipped = 0;
  const ins = db.prepare(`INSERT OR IGNORE INTO hola_replies
    (message_key, from_email, subject, received_at, excerpt, classification, signals, linked_kind, linked_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const raw of list) {
    const m = raw || {};
    const { classification, signals, excerpt } = classifyReply(m);
    const link = determineLink(db, m);
    const r = ins.run(
      messageKey(m, excerpt),
      String(m.from || m.from_email || '').trim().slice(0, 200),
      String(m.subject || '').trim().slice(0, 300),
      String(m.received_at || m.date || '').trim().slice(0, 60),
      excerpt, classification, signals.join(','), link.linked_kind || '', link.linked_ref || ''
    );
    if (Number(r.changes) > 0) inserted++; else skipped++;
  }
  return { inserted, skipped, total: list.length };
}

function listReplies(db, opts) {
  ensureTable(db);
  const o = opts || {};
  const where = [], args = [];
  if (o.classification && CLASSIFICATIONS.includes(o.classification)) { where.push('classification = ?'); args.push(o.classification); }
  if (o.linked_kind && LINK_KINDS.includes(o.linked_kind)) { where.push('linked_kind = ?'); args.push(o.linked_kind); }
  const limit = Math.min(Math.max(Number(o.limit || 100), 1), 500);
  const sql = `SELECT id, from_email, subject, received_at, excerpt, classification, signals, linked_kind, linked_ref, status, created_at
    FROM hola_replies ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
  return db.prepare(sql).all(...args, limit);
}

// Lector propiamente dicho: pide mensajes a una FUENTE inyectada y los
// ingiere. Fuente = objeto con fetchMessages() (o fetchReplies()) async que
// devuelve [{id?, from, subject, body|text, received_at}] — copias, nunca
// la casilla. Sin fuente inyectada no hay acople real (ver cabecera):
// responde available:false sin inventar una bandeja.
async function pollInbox(db, source) {
  if (!source || (typeof source.fetchMessages !== 'function' && typeof source.fetchReplies !== 'function')) {
    return { available: false, reason: 'no_inbound_source_configured', inserted: 0, skipped: 0 };
  }
  const fetchFn = source.fetchMessages || source.fetchReplies;
  const messages = await fetchFn.call(source);
  const out = ingestReplies(db, Array.isArray(messages) ? messages : []);
  return { available: true, ...out };
}

// ¿Hay acople de lectura configurado en el entorno? Hoy: ninguno (ver
// cabecera). Queda el punto único donde una fuente real lo declarará.
function inboundConfigured() {
  return false;
}

module.exports = {
  CLASSIFICATIONS,
  LINK_KINDS,
  RULES,
  classifyReply,
  determineLink,
  messageKey,
  ensureTable,
  ingestReplies,
  listReplies,
  pollInbox,
  inboundConfigured,
};
