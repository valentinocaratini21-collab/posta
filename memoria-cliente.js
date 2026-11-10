// (LOTE v873 · MEMORIA POR CLIENTE) Después de cada conversación del
// chat, Posty actualiza lo que sabe del cliente (gustos, preferencias,
// decisiones, correcciones, qué le gustó y qué no) y lo lee ANTES de
// generar — así los posteos salen más parecidos al cliente y los cambios
// se entienden sin volver a preguntar.
//
// QUÉ se guarda (solo lo durable y explícito, en 5 tipos):
//   decision        — una decisión del cliente ("de ahora en más vendemos
//                     solo los fines de semana").
//   preferencia     — una preferencia estable ("prefiero que los posteos
//                     salgan a la mañana").
//   correccion      — una corrección de un dato real ("el precio es $50,
//                     no $40"; "ese producto ya no lo tenemos").
//   gusto_contenido — qué le gustó o no le gustó de un contenido ("me
//                     encantó el posteo del lunes, hacé más así").
//   contexto        — un hecho del negocio o del cliente que cambia cómo
//                     hay que postear ("estoy de vacaciones esta semana").
// NO se guarda: saludos ni preguntas; lenguaje tentativo ("quizás",
// "tal vez", "estoy pensando"); preferencias de ESTILO (hashtags, emojis,
// largo del texto) — esas ya las guarda taste-memory (v392) y no se
// duplican; el chat completo (solo lo que cambia lo que Posty sabe del
// cliente); nada que el LLM deduzca o invente (solo lo explícito).
//
// DÓNDE vive: tabla `memoria_cliente` (db.js, junto a chat_messages).
// Cada entrada guarda su fuente (`ejemplo`: el mensaje del cliente que
// la justificó, truncado) para que se pueda auditar por qué Posty lo
// recuerda. Máximo 3 entradas por conversación; cada texto ≤ 140
// caracteres; máximo 30 activas por cliente (las más viejas se
// desactivan); dedupe por texto normalizado.
//
// Todo fail-open: la extracción nunca frena el chat y la lectura nunca
// frena la generación. Sin memoria, se genera como antes.
'use strict';

const MAX_POR_TURNO = 3;
const MAX_ACTIVAS = 30;
const MAX_BRIEF = 8;
const MAX_TEXTO = 140;
const TIMEOUT_MS = 15000;

const TIPOS = ['decision', 'preferencia', 'correccion', 'gusto_contenido', 'contexto'];
const TIPO_LABEL = {
  decision: 'decisión',
  preferencia: 'preferencia',
  correccion: 'corrección',
  gusto_contenido: 'le gustó / no le gustó',
  contexto: 'contexto',
};

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS memoria_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'nota',
    texto TEXT NOT NULL,
    ejemplo TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    active INTEGER NOT NULL DEFAULT 1
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_memoria_cliente_user ON memoria_cliente(user_id, active, created_at)');
}

function normalizar(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// El mensaje del usuario es solo saludo/acuse (nada durable que aprender).
function esSaludo(t) {
  const s = normalizar(t);
  if (!s) return true;
  if (s.length < 8) return true;
  return /^(hola|buen dia|buenas tardes|buenas noches|buenas|gracias|ok|dale|perfecto|genial|chau|si|no|jaja|jeje)\b/.test(s) && s.length < 40;
}

// El último intercambio completo del chat: el último mensaje del usuario
// y la respuesta del asistente que le siguió. Si no hay respuesta del
// asistente después del último mensaje del usuario, no hay intercambio
// que aprender (la respuesta todavía no llegó o no hubo).
function ultimoIntercambio(db, uid) {
  const rows = db.prepare(
    "SELECT role, text FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 8"
  ).all(uid);
  if (!rows || !rows.length) return null;
  let asistente = null;
  let usuario = null;
  for (const r of rows) {
    if (r.role === 'assistant' && !asistente) { asistente = String(r.text || ''); continue; }
    if (r.role === 'user' && asistente && !usuario) { usuario = String(r.text || ''); break; }
  }
  if (!usuario || !asistente) return null;
  return { usuario, asistente };
}

const PROMPT_EXTRACCION = `Sos un extractor de memoria para Posty, un community manager. Te paso el último intercambio del chat con un cliente (su mensaje y la respuesta que recibió). Devolvé SOLO un JSON válido: {"entradas": [{"tipo": "...", "texto": "..."}]}.
Extraé SOLO hechos durables y explícitos sobre ESTE cliente, de estos tipos:
- "decision": una decisión del cliente ("de ahora en más vendemos solo los fines de semana", "no más posteos de ese producto").
- "preferencia": una preferencia estable ("prefiero que los posteos salgan a la mañana", "me gusta más el tono cercano").
- "correccion": una corrección de un dato real ("el precio es $50, no $40", "ese producto ya no lo tenemos", "abrimos a las 10").
- "gusto_contenido": qué le gustó o no le gustó de un contenido ("me encantó el posteo del lunes, hacé más así", "ese ángulo no me gusta").
- "contexto": un hecho del negocio o del cliente que cambia cómo hay que postear ("estoy de vacaciones esta semana", "cambiamos de proveedor").
Reglas: máximo 3 entradas; cada texto en las palabras del cliente, máximo 140 caracteres; si no hay nada durable y explícito, devolvé {"entradas": []}; NO inventes ni deduzcas; NO extraigas saludos, preguntas, ni lenguaje tentativo ("quizás", "tal vez", "estoy pensando"); NO extraigas preferencias de ESTILO (hashtags, emojis, largo del texto, mayúsculas) — esas ya se guardan aparte.`;

async function extraerConLLM(apiKey, usuario, asistente) {
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT_EXTRACCION },
          { role: 'user', content: `Cliente: ${String(usuario).slice(0, 1000)}\nPosty: ${String(asistente).slice(0, 1000)}` },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return [];
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed && parsed.entradas) ? parsed.entradas : [];
    return arr.slice(0, MAX_POR_TURNO).map(e => ({
      tipo: TIPOS.includes(e && e.tipo) ? e.tipo : 'nota',
      texto: String((e && e.texto) || '').trim().slice(0, MAX_TEXTO),
    })).filter(e => e.texto.length >= 4);
  } catch (e) {
    return [];
  } finally {
    clearTimeout(t);
  }
}

// Guarda las entradas (dedupe por texto normalizado + tope de 30 activas).
// Devuelve cuántas se guardaron.
function guardarMemoria(db, uid, entradas, ejemplo) {
  try { ensureSchema(db); } catch (e) {}
  const existentes = db.prepare(
    'SELECT texto FROM memoria_cliente WHERE user_id = ? AND active = 1'
  ).all(uid).map(r => normalizar(r.texto));
  const ej = String(ejemplo || '').slice(0, 200);
  let guardadas = 0;
  for (const e of entradas) {
    const norm = normalizar(e.texto);
    if (!norm || existentes.includes(norm)) continue;
    db.prepare(
      'INSERT INTO memoria_cliente (user_id, tipo, texto, ejemplo) VALUES (?, ?, ?, ?)'
    ).run(uid, e.tipo, e.texto, ej);
    existentes.push(norm);
    guardadas++;
  }
  // Tope de 30 activas: las más viejas se desactivan.
  const n = db.prepare('SELECT COUNT(*) AS c FROM memoria_cliente WHERE user_id = ? AND active = 1').get(uid);
  const exceso = (n && n.c ? n.c : 0) - MAX_ACTIVAS;
  if (exceso > 0) {
    const viejas = db.prepare(
      'SELECT id FROM memoria_cliente WHERE user_id = ? AND active = 1 ORDER BY created_at ASC, id ASC LIMIT ?'
    ).all(uid, exceso);
    for (const v of viejas) {
      db.prepare('UPDATE memoria_cliente SET active = 0 WHERE id = ?').run(v.id);
    }
  }
  return guardadas;
}

// Extrae la memoria del último intercambio y la guarda. Fail-open: nunca
// tira; cualquier error (sin clave, sin intercambio, LLM caído, timeout)
// devuelve {saved: 0}.
async function extraerYGuardar(db, uid, apiKey) {
  try {
    if (!uid || !apiKey) return { saved: 0, reason: 'sin_clave' };
    try { ensureSchema(db); } catch (e) {}
    const intercambio = ultimoIntercambio(db, uid);
    if (!intercambio) return { saved: 0, reason: 'sin_intercambio' };
    if (esSaludo(intercambio.usuario)) return { saved: 0, reason: 'saludo' };
    const entradas = await extraerConLLM(apiKey, intercambio.usuario, intercambio.asistente);
    if (!entradas.length) return { saved: 0, reason: 'nada_durable' };
    const saved = guardarMemoria(db, uid, entradas, intercambio.usuario);
    return { saved, entradas: entradas.map(e => e.texto) };
  } catch (e) {
    return { saved: 0, reason: 'error' };
  }
}

// Bloque de texto corto para el brief del generador (las 8 activas más
// recientes, una línea por entrada). Fail-open: error → ''.
function memoriaParaBrief(db, uid) {
  try {
    try { ensureSchema(db); } catch (e) {}
    const rows = db.prepare(
      'SELECT tipo, texto FROM memoria_cliente WHERE user_id = ? AND active = 1 ORDER BY created_at DESC, id DESC LIMIT ?'
    ).all(uid, MAX_BRIEF);
    if (!rows || !rows.length) return '';
    return rows.map(r => `- (${TIPO_LABEL[r.tipo] || r.tipo}) ${r.texto}`).join('\n');
  } catch (e) {
    return '';
  }
}

function listar(db, uid) {
  try {
    try { ensureSchema(db); } catch (e) {}
    return db.prepare(
      'SELECT id, tipo, texto, ejemplo, created_at FROM memoria_cliente WHERE user_id = ? AND active = 1 ORDER BY created_at DESC, id DESC LIMIT ?'
    ).all(uid, MAX_ACTIVAS);
  } catch (e) {
    return [];
  }
}

function olvidar(db, uid, id) {
  try {
    try { ensureSchema(db); } catch (e) {}
    const r = db.prepare('UPDATE memoria_cliente SET active = 0 WHERE id = ? AND user_id = ?').run(id, uid);
    return { ok: true, changes: r.changes || 0 };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

module.exports = {
  MAX_POR_TURNO, MAX_ACTIVAS, MAX_BRIEF,
  TIPOS, TIPO_LABEL,
  ensureSchema, normalizar, esSaludo, ultimoIntercambio,
  extraerConLLM, guardarMemoria, extraerYGuardar,
  memoriaParaBrief, listar, olvidar,
};
