// supervision-chat.js — SUPERVISIÓN DEL CHAT DE POSTY (bamboo detrás de Posty).
// Decisión de Valentino 23:38 (RETIRADA en v916 · veto 11/11: respuesta
// inmediata): SIEMPRE, PARA TODOS — bamboo tomaba responsabilidad de cada
// conversación y Posty solo respondía por dictado. Desde v916 el cerebro
// responde en el acto y este módulo solo queda como consola del operador.
//
// Reglas del módulo (v916 · SACAR-ACUSE-FIJO · veto Valentino 11/11):
// - La puerta YA NO existe: el acuse fijo está vetado y el cerebro
//   responde en el acto. Este módulo ya NO corre en el camino caliente
//   del chat: solo queda la consola del operador (cola, hilo,
//   dictado, borrador, decisiones) para los ítems que ya existan. Nada
//   del chat retiene, nada devuelve pending, nada espera dictado.
// - El dictado envía el texto exacto COMO Posty (replyAsPosty: fila
//   `assistant` en chat_messages + registro responder_chat). El dictado
//   manda TEXTO, no ejecuta acciones: si el cliente pidió una acción
//   (aprobar, publicar, cambiar día), bamboo la ejecuta por las vías de
//   operador existentes; el texto dictado nunca debe afirmar una acción
//   que no se hizo.
// - El aviso en vivo es fire-and-forget a SUPERVISION_HOOK_URL (si no está
//   configurada, no-op). Nunca bloquea ni lanza.
// - SUPERVISION_OFF=1 y la exención ADN quedan sin efecto (v916): no hay
//   puerta que saltear; el cerebro responde siempre en el acto.
// - (v854 · OBSERVABILIDAD, HISTÓRICO desde v916) `supervision_decisiones`
//   guarda lo que la puerta decidió mientras existió ('retenido' |
//   'exento_adn' | 'apagado_off' | 'fallo_puerta'). Desde v916 nada
//   registra turnos nuevos: la puerta no corre. Se lee en
//   GET /api/admin/supervision/decisiones.
// - (v854 · EXENCIÓN ADN ANGOSTADA, SIN EFECTO desde v916) La exención
//   decidía qué turnos no pasaban por la puerta. Sin puerta, no exime
//   de nada: la entrevista de ADN corre con el cerebro como siempre.
'use strict';

const supportCases = require('./support-cases');


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
  CREATE INDEX IF NOT EXISTS idx_supervision_usuario ON supervision_pendientes(user_id, estado);
  CREATE TABLE IF NOT EXISTS supervision_decisiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    decision TEXT NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_supervision_decisiones_dia ON supervision_decisiones(created_at, decision);
  CREATE INDEX IF NOT EXISTS idx_supervision_decisiones_usuario ON supervision_decisiones(user_id, created_at);`);
}

function abiertoDe(db, uid) {
  return safe(() => db.prepare(
    `SELECT * FROM supervision_pendientes WHERE user_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1`
  ).get(Number(uid)), null);
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

// (v854) ¿Este texto pregunta por el ADN del negocio? Las 4 preguntas de la
// entrevista usan siempre las mismas raíces (generator.js: dnaGuide).
const ADN_PREGUNTA_RE = /producto o servicio estrella|cliente ideal|te diferencia|diferencia de la competencia|c[oó]mo (quer[eé]s|quieres) sonar|como queres sonar/i;
function preguntaADN(texto) {
  return ADN_PREGUNTA_RE.test(String(texto || ''));
}

// (v854 · EXENCIÓN ADN ANGOSTADA) ¿La entrevista de ADN está EN CURSO en
// este turno? Solo entonces el turno se exime de la puerta.
// - Sin ADN incompleto: nunca (el llamador ya lo sabe; se recibe el flag).
// - Sin mensaje previo del asistente: sí — la entrevista está por arrancar
//   y el cerebro aún no tuvo su turno para preguntar.
// - Con un solo mensaje previo y sin pregunta de ADN (el saludo): sí —
//   el cerebro todavía no preguntó; el turno siguiente es su oportunidad.
// - Si el último mensaje del asistente preguntó por ADN: sí — el usuario
//   está contestando la entrevista.
// - En cualquier otro caso: NO. El usuario que pide posteos con el ADN a
//   medias no queda exento para siempre: la puerta aplica y bamboo ve el
//   pendiente (la entrevista se retoma por dictado si hace falta).
function entrevistaEnCurso(clean, dnaIncompleto) {
  if (!dnaIncompleto) return false;
  const mensajes = Array.isArray(clean) ? clean : [];
  const asistentes = mensajes.filter((m) => m && m.role === 'assistant');
  if (!asistentes.length) return true;
  const ultimo = asistentes[asistentes.length - 1];
  if (preguntaADN(ultimo && ultimo.text)) return true;
  if (asistentes.length === 1) return true;
  return false;
}

// (v854 · OBSERVABILIDAD) Registra la decisión de la puerta en un turno.
// Nunca lanza ni rompe el chat: si el registro falla, solo se loguea.
// Decisiones: 'retenido' | 'exento_adn' | 'apagado_off' | 'fallo_puerta'.
function registrarDecision(db, o) {
  try {
    const decision = String((o && o.decision) || '');
    if (!decision) return false;
    try { ensureSchema(db); } catch (e) {}
    db.prepare(
      'INSERT INTO supervision_decisiones (user_id, decision, detalle) VALUES (?,?,?)'
    ).run(Number((o && o.userId) || 0), decision, String((o && o.detalle) || '').slice(0, 500));
    return true;
  } catch (e) {
    try { console.error('[supervision] no se pudo registrar la decisión:', e.message); } catch (_) {}
    return false;
  }
}

// (v854 · OBSERVABILIDAD) Conteo de decisiones por día + filas recientes.
// Es lo que permite distinguir desde el admin, sin logs de Railway:
// 'apagado_off' > 0 = SUPERVISION_OFF=1 en producción (hay que sacarlo en
// Railway); 'exento_adn' > 0 para el dueño = la exención lo sigue agarrando;
// 'fallo_puerta' > 0 = la puerta falla (ver el detalle); 'retenido' = la
// puerta retiene como debe.
function resumenDecisiones(db, dias) {
  try { ensureSchema(db); } catch (e) {}
  const n = Math.min(30, Math.max(1, parseInt(dias, 10) || 7));
  const filas = safe(() => db.prepare(
    `SELECT substr(created_at, 1, 10) AS fecha, decision, COUNT(*) AS c
     FROM supervision_decisiones
     WHERE created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY fecha, decision ORDER BY fecha DESC, decision ASC`
  ).all(n), []);
  const porDia = {};
  for (const f of filas) {
    const fecha = String(f.fecha || '').slice(0, 10);
    if (!porDia[fecha]) porDia[fecha] = { fecha, retenido: 0, exento_adn: 0, apagado_off: 0, fallo_puerta: 0, total: 0 };
    const d = porDia[fecha];
    if (f.decision === 'retenido') d.retenido = Number(f.c) || 0;
    else if (f.decision === 'exento_adn') d.exento_adn = Number(f.c) || 0;
    else if (f.decision === 'apagado_off') d.apagado_off = Number(f.c) || 0;
    else if (f.decision === 'fallo_puerta') d.fallo_puerta = Number(f.c) || 0;
    d.total += Number(f.c) || 0;
  }
  const recientes = safe(() => db.prepare(
    `SELECT id, user_id, decision, detalle, created_at FROM supervision_decisiones
     ORDER BY id DESC LIMIT 50`
  ).all(), []);
  return { ok: true, dias: Object.values(porDia), recientes };
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
  ensureSchema, leerHilo, listarPendientes, dictar, guardarBorrador,
  preguntaADN, entrevistaEnCurso, registrarDecision, resumenDecisiones,
};
