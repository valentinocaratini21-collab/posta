// push-operador.js — (LOTE CONSERJE-PUSH-OPERADOR · censo-conserje-3 §5.5)
// Los avisos del OPERADOR con el teléfono bloqueado: lo que hoy solo ve
// el monitor externo (el cron que lee pendientes cada minuto) le llega
// también como push a la consola instalada, atado a su identidad — la
// cuenta de la casa (user_id 12, la misma que conserje-revision llama
// OWNER_USER_ID). Tres fuentes, un solo núcleo con dedup durable:
//
//   1 · Caso nuevo en la superficie de pendientes (incluido
//       preflight_casa): hook inmediato en el punto único de apertura
//       (support-cases.openCase llama a hookCaso cuando el caso nace,
//       nunca cuando es duplicado) + el barrido como red.
//   2 · Idea/pedido nuevo sin revisar: hook inmediato en la ruta de la
//       idea escrita (POST /api/subir/idea) + el barrido sobre
//       voiceRequests (los pedidos del chat no tienen un único punto
//       de inserción: nacen del flujo del chat en varias rutas).
//   3 · Pieza de mañana esperando decisión pasada la hora de corte:
//       SOLO barrido — es un hecho del reloj, no un nacimiento. La
//       hora de corte es la apertura de la ventana de revisión de la
//       casa (19:00, hora del dueño — conserje-revision.estadoVentana).
//
// Dedup (el patrón de los monitores, durable en tabla): cada aviso
// tiene una clave estable (caso-<id> · pedido-<message_id> ·
// idea-<idea_id>-<message_id> · decision-<post_id>-<fecha>) y la tabla
// operador_avisos la reclama ANTES de enviar (INSERT OR IGNORE: si la
// fila ya estaba, es duplicado y no se manda nada). Si el envío no
// sale (sin suscripción, sin VAPID, fallo de transporte), la clave se
// LIBERA: el aviso no se pierde, lo reintenta el próximo barrido — y
// «sin suscripción no se manda nada» sale solo, porque sendPush sin
// suscripciones devuelve no_subs sin tocar la red.
//
// Deep link: la consola solo sabe seguir ?user=<uid>&post=<id> (abre
// la ficha del negocio con el posteo marcado). NO existe parámetro
// para «la tarjeta» puntual: el aviso aterriza en la ficha del negocio
// del evento (con su posteo, cuando el evento tiene uno), que es el
// drill-in canónico de la consola. Declarado en el informe del lote.
//
// Textos: cortos, en palabras de la casa, sin tecnicismos (ningún id
// interno ni ruta en el texto; los ids viven solo en el link).
// Nunca lanza: todo camino devuelve { ok, reason? } o el resumen.
'use strict';

const push = require('./push');

const OPERADOR_USER_ID = 12; // la casa (conserje-revision.OWNER_USER_ID)
const TITULO = 'Conserje';
// Los tipos de caso que la superficie de pendientes del operador
// muestra (pendingConcierge): los de línea a mano / retorno /
// preflight nacen como casos, y el mensaje en modo conserje abre el
// suyo (tipo 'conserje', dedup por cliente en divertToConcierge).
const TIPOS_CON_PENDIENTE = ['conserje', 'prueba_linea_mano', 'prueba_retorno_dm', 'preflight_casa'];
const CORTE_DECISION = '19:00'; // apertura de la ventana de revisión (conserje-revision)

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS operador_avisos (
    clave TEXT PRIMARY KEY,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function nombreNegocio(db, uid, conocido) {
  if (conocido) return String(conocido);
  const p = safe(() => db.prepare('SELECT business_name FROM profiles WHERE user_id = ?').get(Number(uid)), null);
  return (p && p.business_name) || '';
}
function negocioTxt(nombre) { return nombre ? String(nombre) : 'Un negocio'; }

function linkFicha(uid, postId) {
  return '/conserje?user=' + Number(uid) + (postId ? '&post=' + Number(postId) : '');
}

// ---------------------------------------------------------------------
// El núcleo: dedup durable + envío al operador.
// opts.sendFn permite inyectar el transporte en tests (patrón de la
// casa, el mismo de push.notifyPostFailed con opts.sendFn).
async function avisarOperador(db, aviso, opts) {
  const o = opts || {};
  if (!db) return { ok: false, reason: 'no_db' };
  ensureSchema(db);
  const clave = String((aviso && aviso.clave) || '');
  if (!clave) return { ok: false, reason: 'sin_clave' };
  // Reclamo atómico de la clave: si ya estaba, este evento ya avisó.
  const ins = safe(() => db.prepare('INSERT OR IGNORE INTO operador_avisos (clave) VALUES (?)').run(clave), null);
  if (!ins) return { ok: false, reason: 'sin_tabla' };
  if (!ins.changes) return { ok: false, reason: 'duplicado' };
  const send = o.sendFn || ((uid, payload) => push.sendPush(uid, payload));
  let r = null;
  try {
    r = await send(OPERADOR_USER_ID, {
      title: String(aviso.title || TITULO),
      body: String(aviso.body || ''),
      url: String(aviso.url || '/conserje'),
    });
  } catch (e) { r = { ok: false, reason: 'send_failed' }; }
  if (r && r.ok) return { ok: true, sent: r.sent || 0 };
  // No salió: se libera la clave para que el barrido lo reintente
  // cuando se pueda (p. ej. cuando el operador active los avisos).
  safe(() => db.prepare('DELETE FROM operador_avisos WHERE clave = ?').run(clave), null);
  return { ok: false, reason: (r && r.reason) || 'envio_fallo' };
}

// ---------------------------------------------------------------------
// Constructores de aviso por fuente. Puros sobre la fila que reciben
// (la DB solo se toca para el nombre del negocio si no viaja).

function avisoDeCaso(db, caso) {
  if (!caso || !caso.id) return null;
  const uid = Number(caso.user_id) || 0;
  if (!uid) return null;
  const nombre = negocioTxt(nombreNegocio(db, uid, caso.business_name));
  let body = '';
  if (caso.tipo === 'preflight_casa') body = 'El posteo de la casa de hoy está en riesgo: el chequeo encontró un problema. Entrá a verlo.';
  else if (caso.tipo === 'conserje') body = nombre + ' te escribió y espera respuesta.';
  else if (caso.tipo === 'prueba_retorno_dm') body = 'A ' + nombre + ' hay que mandarle el link de regreso por mensaje.';
  else if (caso.tipo === 'prueba_linea_mano') body = nombre + ' necesita una mano con su prueba.';
  else body = nombre + ' tiene un caso nuevo que te necesita.';
  return {
    clave: 'caso-' + Number(caso.id),
    title: TITULO,
    body: trunc(body, 180),
    url: linkFicha(uid, caso.post_id ? Number(caso.post_id) : 0),
  };
}

// p = ítem de supportCases.voiceRequests (o su forma mínima: user_id,
// id del mensaje, es_idea, idea_id, posteo).
function avisoDePedido(db, p) {
  if (!p || !p.id) return null;
  const uid = Number(p.user_id) || 0;
  if (!uid) return null;
  const nombre = negocioTxt(nombreNegocio(db, uid, p.business_name));
  const esIdea = !!p.es_idea;
  return {
    clave: esIdea ? ('idea-' + Number(p.idea_id || 0) + '-' + Number(p.id)) : ('pedido-' + Number(p.id)),
    title: TITULO,
    body: esIdea ? (nombre + ' dejó una idea escrita en Subir, sin revisar.') : (nombre + ' dejó un pedido sin revisar.'),
    url: linkFicha(uid, p.posteo && p.posteo.id ? Number(p.posteo.id) : 0),
  };
}

// d = ítem clase 'decision' de vista.mano (la pieza de mañana).
function avisoDeDecision(db, d) {
  if (!d || !d.post_id) return null;
  const uid = Number(d.user_id) || 0;
  if (!uid) return null;
  const nombre = negocioTxt(nombreNegocio(db, uid, d.business_name));
  return {
    clave: 'decision-' + Number(d.post_id) + '-' + String(d.fecha || ''),
    title: TITULO,
    body: 'La pieza de mañana de ' + nombre + ' sigue esperando tu decisión.',
    url: linkFicha(uid, Number(d.post_id)),
  };
}

// ---------------------------------------------------------------------
// El hook inmediato de los casos: lo llama support-cases.openCase SOLO
// cuando el caso nace (los duplicados por dedup_key vuelven antes y
// nunca llegan acá). Fire-and-forget del lado del llamador; acá todo
// error se traga y se devuelve como reason.
async function hookCaso(db, caso, opts) {
  try {
    if (!caso || !TIPOS_CON_PENDIENTE.includes(String(caso.tipo || ''))) return { ok: false, reason: 'tipo_sin_aviso' };
    const aviso = avisoDeCaso(db, caso);
    if (!aviso) return { ok: false, reason: 'sin_aviso' };
    return await avisarOperador(db, aviso, opts);
  } catch (e) { return { ok: false, reason: 'hook_fallo' }; }
}

// El hook inmediato de la idea escrita: lo llama la ruta que la crea
// (POST /api/subir/idea) con la forma mínima del ítem. Los pedidos del
// chat no tienen este hook (nacen por varias rutas del flujo del
// chat): los cubre el barrido sobre voiceRequests.
async function hookPedido(db, p, opts) {
  try {
    const aviso = avisoDePedido(db, p);
    if (!aviso) return { ok: false, reason: 'sin_aviso' };
    return await avisarOperador(db, aviso, opts);
  } catch (e) { return { ok: false, reason: 'hook_fallo' }; }
}

// ---------------------------------------------------------------------
// El barrido: la red de los hooks y la única vía de los hechos del
// reloj. Lee las MISMAS superficies que leen los monitores externos
// (pendingConcierge · voiceRequests · vista.mano) y pasa todo por el
// núcleo con dedup — lo que el hook ya avisó, el barrido lo saltea.
async function barrido(db, opts) {
  const o = opts || {};
  const nowMs = Number(o.nowMs) || Date.now();
  const res = { casos: 0, pedidos: 0, decisiones: 0, enviados: 0 };
  if (!db) return res;
  ensureSchema(db);
  const supportCases = require('./support-cases');

  // 1 · Casos en la superficie de pendientes.
  try {
    const pc = supportCases.pendingConcierge(db);
    for (const p of (pc && pc.pendientes) || []) {
      let aviso = null;
      if (p.caso_id) {
        const caso = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(p.caso_id)), null);
        if (caso) aviso = avisoDeCaso(db, { ...caso, business_name: p.business_name || caso.business_name });
      } else if (p.user_id && p.ultimo_mensaje_en) {
        // Pendiente de chat sin caso enlazado: la clave estable es el
        // cliente + la hora de su último mensaje (un mensaje nuevo =
        // una clave nueva; el mismo mensaje nunca avisa dos veces).
        aviso = {
          clave: 'chat-' + Number(p.user_id) + '-' + String(p.ultimo_mensaje_en).replace(/[^0-9]/g, ''),
          title: TITULO,
          body: negocioTxt(p.business_name) + ' te escribió y espera respuesta.',
          url: linkFicha(Number(p.user_id), 0),
        };
      }
      if (!aviso) continue;
      res.casos++;
      const r = await avisarOperador(db, aviso, o);
      if (r.ok) res.enviados++;
    }
  } catch (e) { /* una fuente caída no frena las demás */ }

  // 2 · Ideas y pedidos sin revisar (la cola de pedidos-voz).
  try {
    const vr = supportCases.voiceRequests(db, { limit: 60 });
    for (const p of (vr && vr.pedidos) || []) {
      if (!p.revision || p.revision.estado !== 'pendiente') continue;
      const aviso = avisoDePedido(db, p);
      if (!aviso) continue;
      res.pedidos++;
      const r = await avisarOperador(db, aviso, o);
      if (r.ok) res.enviados++;
    }
  } catch (e) { /* idem */ }

  // 3 · Piezas de mañana esperando decisión, pasada la hora de corte
  // (la ventana de revisión abre a las 19:00 del dueño).
  try {
    const conserjeRevision = require('./conserje-revision');
    const ventana = conserjeRevision.estadoVentana(db, nowMs);
    if (ventana && ventana.estado === 'abierta') {
      const conserjeVista = require('./conserje-vista');
      const v = conserjeVista.vista(db, { nowMs });
      for (const d of (v && v.mano) || []) {
        if (!d || d.clase !== 'decision') continue;
        const aviso = avisoDeDecision(db, d);
        if (!aviso) continue;
        res.decisiones++;
        const r = await avisarOperador(db, aviso, o);
        if (r.ok) res.enviados++;
      }
    }
  } catch (e) { /* idem */ }

  return res;
}

module.exports = {
  OPERADOR_USER_ID,
  TIPOS_CON_PENDIENTE,
  CORTE_DECISION,
  ensureSchema,
  avisarOperador,
  avisoDeCaso,
  avisoDePedido,
  avisoDeDecision,
  hookCaso,
  hookPedido,
  barrido,
};
