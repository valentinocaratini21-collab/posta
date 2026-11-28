// push-operador.js — (LOTE CONSERJE-PUSH-OPERADOR · censo-conserje-3 §5.5)
// (AJUSTE CONSERJE-PUSH-URGENTES · orden del dueño 27/11 23:27: «no me
// mandes push notifications de cada cosa que necesita los clientes.
// solo mandame las urgentes: un posteo no salio, pidieron un cambio, o
// algo de ese estilo.»)
// (LOTE CONSERJE-AVISOS-APAGADOS · orden del dueño 27/11 23:48: «no
// mandarme notificaciones de clientes. Te tenes que hacer cargo vos
// de todo.») Las push del conserje al operador quedan APAGADAS POR
// COMPLETO: el interruptor avisosActivos() (env OPERADOR_AVISOS ===
// 'on', default APAGADO) cortocircuita el embudo único de envío y la
// entrada de cada hook y del barrido ANTES de reclamar claves de
// dedup — apagado no se manda nada, no se toca la red y no se quema
// ninguna clave, así el historial de avisos arranca limpio si el
// dueño los vuelve a prender. La taxonomía de urgentes de abajo
// queda DORMIDA, intacta: es el comportamiento con el interruptor
// prendido. Las rutas de suscripción/estado no cambian (suscribirse
// no manda nada por sí mismo).
// Los avisos del OPERADOR con el teléfono bloqueado, atados a su
// identidad — la cuenta de la casa (user_id 12, la misma que
// conserje-revision llama OWNER_USER_ID). Desde el ajuste, SOLO avisa
// lo urgente: ya pasó algo malo o el cliente está esperando. Tres
// fuentes, un solo núcleo con dedup durable:
//
//   1 · Un posteo NO SALIÓ: hookFallo, enganchado al evento persistente
//       post_failed (el instrumento v198-A) en sus dos emisores — el
//       schedEvent del scheduler (la publicación de las 19:00 que
//       marca el posteo 'failed', y la denegación de Meta que lo deja
//       pausado sin reintento) y el evTrack de server.js (el barrido
//       que marca 'failed' los posteos trabados en publishing). Es la
//       misma señal que ya dispara la push de falla al CLIENTE
//       (push.notifyPostFailed cuelga de esos dos mismos puntos).
//   2 · Pidieron un cambio / pidieron algo: idea/pedido nuevo sin
//       revisar — hook inmediato en la ruta de la idea escrita
//       (POST /api/subir/idea) + el barrido sobre voiceRequests (los
//       pedidos del chat no tienen un único punto de inserción: nacen
//       del flujo del chat en varias rutas).
//   3 · El cliente escribió y espera respuesta: los casos tipo
//       'conserje' y 'prueba_retorno_dm' — hook inmediato en el punto
//       único de apertura (support-cases.openCase llama a hookCaso
//       cuando el caso nace, nunca cuando es duplicado) + el barrido
//       como red sobre pendingConcierge.
//
// Lo que YA NO avisa (sigue existiendo en el conserje, solo deja de
// zumbar): los casos prueba_linea_mano (órdenes internas de
// producción: la cola de trabajo, no una urgencia), los casos
// preflight_casa (avisos de riesgo: todavía no falló nada) y el
// recordatorio de piezas esperando decisión (la rama del reloj se
// eliminó entera: las decisiones viven en la bandeja, no en el push).
//
// Dedup (el patrón de los monitores, durable en tabla): cada aviso
// tiene una clave estable (fallo-<post_id> · caso-<id> ·
// pedido-<message_id> · idea-<idea_id>-<message_id>) y la tabla
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
// Los ÚNICOS tipos de caso que avisan (regla de urgentes): el cliente
// escribió y espera respuesta — el mensaje en modo conserje (tipo
// 'conserje', dedup por cliente en divertToConcierge) y el retorno del
// invitado por DM ('prueba_retorno_dm'). Los demás tipos que la
// superficie de pendientes muestra (línea a mano, preflight de la
// casa) se ven en el conserje pero NO zumban.
const TIPOS_URGENTES = ['conserje', 'prueba_retorno_dm'];

// EL INTERRUPTOR (LOTE CONSERJE-AVISOS-APAGADOS): las push del
// conserje al operador solo existen si la env OPERADOR_AVISOS vale
// exactamente 'on'. Sin la variable — el default — están APAGADAS.
// Se lee en cada llamada (no se cachea al requerir el módulo).
function avisosActivos() {
  return process.env.OPERADOR_AVISOS === 'on';
}

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
  // Interruptor apagado: no se crea tabla, no se reclama clave, no
  // se toca la red. TODOS los caminos pasan por este embudo.
  if (!avisosActivos()) return { ok: false, reason: 'avisos_apagados' };
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
  if (caso.tipo === 'conserje') body = nombre + ' te escribió y espera respuesta.';
  else if (caso.tipo === 'prueba_retorno_dm') body = 'A ' + nombre + ' hay que mandarle el link de regreso por mensaje.';
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

// f = { user_id, post_id } del posteo que no salió (la forma que
// emiten los dos caminos del evento post_failed). La clave es por
// posteo: un posteo que no salió avisa UNA sola vez en la vida,
// aunque el fracaso se registre por más de un camino.
function avisoDeFallo(db, f) {
  if (!f || !f.post_id) return null;
  const uid = Number(f.user_id) || 0;
  if (!uid) return null;
  const nombre = negocioTxt(nombreNegocio(db, uid, f.business_name));
  return {
    clave: 'fallo-' + Number(f.post_id),
    title: TITULO,
    body: 'El posteo de hoy de ' + nombre + ' no salió.',
    url: linkFicha(uid, Number(f.post_id)),
  };
}

// ---------------------------------------------------------------------
// El hook inmediato de los casos: lo llama support-cases.openCase SOLO
// cuando el caso nace (los duplicados por dedup_key vuelven antes y
// nunca llegan acá). Fire-and-forget del lado del llamador; acá todo
// error se traga y se devuelve como reason.
async function hookCaso(db, caso, opts) {
  try {
    if (!avisosActivos()) return { ok: false, reason: 'avisos_apagados' };
    if (!caso || !TIPOS_URGENTES.includes(String(caso.tipo || ''))) return { ok: false, reason: 'tipo_sin_aviso' };
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
    if (!avisosActivos()) return { ok: false, reason: 'avisos_apagados' };
    const aviso = avisoDePedido(db, p);
    if (!aviso) return { ok: false, reason: 'sin_aviso' };
    return await avisarOperador(db, aviso, opts);
  } catch (e) { return { ok: false, reason: 'hook_fallo' }; }
}

// El hook del posteo que no salió: lo llaman los dos emisores del
// evento post_failed (schedEvent en scheduler.js y evTrack en
// server.js) con el post_id del fracaso, en el mismo punto donde ya
// cuelga la push de falla al cliente. Fire-and-forget del lado del
// llamador; el dedup por posteo hace que avise una sola vez aunque
// el fracaso se registre dos veces.
async function hookFallo(db, f, opts) {
  try {
    if (!avisosActivos()) return { ok: false, reason: 'avisos_apagados' };
    const aviso = avisoDeFallo(db, f);
    if (!aviso) return { ok: false, reason: 'sin_aviso' };
    return await avisarOperador(db, aviso, opts);
  } catch (e) { return { ok: false, reason: 'hook_fallo' }; }
}

// ---------------------------------------------------------------------
// El barrido: la red de los hooks. Lee las MISMAS superficies que
// leen los monitores externos (pendingConcierge · voiceRequests) y
// pasa todo por el núcleo con dedup — lo que el hook ya avisó, el
// barrido lo saltea. Solo entran los urgentes: casos de los tipos
// que avisan (el resto de la superficie — línea a mano, preflight —
// se lee pero no genera aviso) y pedidos/ideas sin revisar. Los
// posteos fallidos NO pasan por el barrido: avisan por su hook en el
// momento del fracaso (un barrido posterior encontraría el posteo ya
// resuelto o reprogramado y avisaría tarde y mal).
async function barrido(db, opts) {
  const o = opts || {};
  const res = { casos: 0, pedidos: 0, enviados: 0 };
  // Interruptor apagado: el barrido ni lee las superficies ni crea
  // la tabla — devuelve el resumen en cero.
  if (!avisosActivos()) return res;
  if (!db) return res;
  ensureSchema(db);
  const supportCases = require('./support-cases');

  // 1 · Casos urgentes en la superficie de pendientes.
  try {
    const pc = supportCases.pendingConcierge(db);
    for (const p of (pc && pc.pendientes) || []) {
      let aviso = null;
      if (p.caso_id) {
        const caso = safe(() => db.prepare('SELECT * FROM support_cases WHERE id = ?').get(Number(p.caso_id)), null);
        if (caso && TIPOS_URGENTES.includes(String(caso.tipo || ''))) {
          aviso = avisoDeCaso(db, { ...caso, business_name: p.business_name || caso.business_name });
        }
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

  return res;
}

module.exports = {
  OPERADOR_USER_ID,
  TIPOS_URGENTES,
  avisosActivos,
  ensureSchema,
  avisarOperador,
  avisoDeCaso,
  avisoDePedido,
  avisoDeFallo,
  hookCaso,
  hookPedido,
  hookFallo,
  barrido,
};
