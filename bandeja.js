// bandeja.js — BANDEJA-RESPONDE (lote 2026-11-22): el modelo
// «borrador + tanda + un toque» para responder comentarios y DMs.
//
// MODELO (decisión del dueño 2026-11-21, reemplaza al modelo anterior):
//   1. NADA sale sin la confirmación del dueño del negocio. Toda
//      respuesta se prepara como BORRADOR con la voz del negocio y los
//      datos REALES de su fundamento (generator.suggestReplyDetailed:
//      si el dato no está en el fundamento, el borrador NO se inventa:
//      el ítem entra marcado «falta el dato» para que lo complete el
//      dueño al editar).
//   2. Los borradores se juntan en la bandeja EN SILENCIO: ningún aviso
//      por comentario.
//   3. UN solo aviso por tanda (notified_at + una push): «ya tenés N
//      respuestas listas». Los comentarios que llegan después se suman
//      a la misma tanda SIN repetir el aviso.
//   4. UN toque aprueba la tanda entera; editar/descartar es la
//      excepción.
//   5. Las sensibles y las de plata (clase 'importante') van ARRIBA de
//      la lista, marcadas — y TAMBIÉN llevan borrador (el dueño decide
//      con la respuesta ya escrita).
//   6. Spam: se oculta en Instagram (si el permiso lo permite) y no se
//      responde; nunca entra a la lista de revisión.
//
// FRENO ANTI-DUPLICADO (dueño, 2026-11-21 — los tres casos):
//   (1) Antes de aprobar: si el negocio ya respondió el hilo desde
//       Instagram, el ítem sale solo de la tanda (estado
//       'ya_respondido'; la revisión lo muestra «Ya respondida por vos»
//       y no cuenta). Se chequea al ingresar y al abrir la revisión
//       (refreshTanda).
//   (2) Al enviar: cada respuesta se RE-CHECKEA justo antes de salir;
//       si el hilo ya tiene respuesta del negocio, NO se envía.
//   (3) Inverso: si la persona escribe de nuevo en el mismo hilo, el
//       borrador quedó viejo: se re-prepara sobre la conversación nueva
//       (si el dueño ya lo editó, su texto se respeta y el ítem se
//       marca «actualizado» para que lo vea).
//
// COMPUERTA DE ENVÍO (asentamiento técnico): el camino de envío está
// construido entero (comentarios: POST /{comment-id}/replies · DMs:
// POST /{ig-id}/messages), pero el acto de enviar lo gobierna el
// permiso de Meta (instagram_business_manage_comments /
// instagram_business_manage_messages — segunda presentación de App
// Review; la primera salió solo con Ads) y el interruptor de Instagram
// «Permitir acceso a los mensajes» en la conexión. Si Meta corta con
// error de permiso (#200/#10), los ítems quedan 'sin_permiso' y la
// tanda lo dice con honestidad: JAMÁS se marca enviado algo que no
// salió.
//
// BANDEJA-VERDAD (lote 2026-11-22): la bandeja dice la verdad.
//   (a) La fórmula retirada («¡Gracias por escribirnos!») era el fallback
//       pre-v1236 y quedó ALMACENADA en bandeja_items.draft: v1236
//       cambió la generación pero nunca migró el stock guardado, y el
//       poll solo re-prepara si llega un mensaje nuevo. Desde este
//       lote, purgarBorradoresFormula barre el stock (al desplegar y
//       como guarda en la lectura): todo borrador que matchea la
//       fórmula se regenera con el redactor actual; si la regeneración
//       no da texto, queda '' con su marca de falta-dato. La fórmula
//       guardada nunca se sirve.
//   (b) ENVIABILIDAD de primera clase: la ingesta acepta DMs de hasta
//       7 días, pero Meta solo deja responderlos dentro de las 24 h
//       del último mensaje entrante. Se guarda ese instante
//       (last_in_at) al ingerir; un DM fuera de ventana NO cuenta
//       como para_salir, NO se ofrece para aprobar y su tarjeta dice
//       la verdad en español. Los comentarios no tienen ventana.
//   (c) approveTanda ya no reintenta a ciegas un ítem en 'error' con
//       causa terminal (ventana/permiso): lo excluye del envío y lo
//       reporta en bloqueadas con su motivo en español; ningún error
//       de Meta se guarda ni se muestra crudo (mapearErrorEnvio).
//
// MEDIDA-TANDA (lote 2026-11-23): la tanda se mide por negocio.
//   (a) REGISTRO DE RESOLUCIÓN: hasta este lote el resultado de un
//       ítem era derivable a medias (estado + flag edited) y el hecho
//       «cayó en falta-dato» se PERDÍA: falta_dato guarda el dato que
//       faltó (precio/horario/fundamento/dato) solo mientras el ítem
//       está frenado — al editarlo o al conseguir texto, la marca se
//       borra. Desde este lote: bandeja_items.resolucion registra en
//       el acto de resolver 'tal_cual' | 'editado' | 'descartado', y
//       bandeja_falta_dato_log guarda UN hecho por ítem y dato (con
//       la fecha de su primera caída) en cada punto donde un ítem
//       queda con falta_dato. Sin reescribir historia: las filas
//       viejas quedan resolucion='' y sin hechos — los números
//       cuentan desde que el lote vive.
//   (b) EL PARTE: censoBandeja suma por negocio los tres números
//       (tal cual / editados / descartados) + cuántos ítems cayeron
//       en falta-dato y por qué dato; tandaConItems trae la medida
//       de SU tanda. Es la misma vía del parte del operador
//       (GET /api/admin/bandeja/censo y /api/admin/users/:id/bandeja).
//   (c) LA PREGUNTA DE LA SEMANA: el dato más repetido en falta-dato
//       del negocio (ítems únicos por dato, últimos 7 días) se
//       convierte en UNA pregunta que abre la próxima tanda NUEVA de
//       ese negocio (bandeja_tandas.pregunta_dato, asignada al nacer
//       la tanda en getOrCreateTanda; una sola por negocio cada
//       7 días; sin faltas no hay pregunta — no se inventa).
//
// Exporta: { initBandejaTables, clasificar, esErrorPermiso,
//   pollBandeja, getBandeja, refreshTanda, editItem, dismissItem,
//   undismissItem, approveTanda, countAcciones, novedades,
//   conteoCampana, marcarNovedadesVistas,
//   purgarBorradoresFormula, censoBandeja, mapearErrorEnvio,
//   esErrorVentana, dmFueraDeVentana, defaultFetchers,
//   registrarFaltaDato, medidaTanda, medidaUsuario, datoTopFalta,
//   asegurarPreguntaTanda, preguntaParaDato }
'use strict';

const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';
const IG_TIMEOUT_MS = 20000;
const MAX_POSTS_SCAN = 5;
const MAX_COMMENTS = 25;
const SINCE_MS = 7 * 86400000;

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
function initBandejaTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS bandeja_tandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    group_key TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'post',
    post_ig_id TEXT DEFAULT '',
    post_caption TEXT DEFAULT '',
    post_thumb TEXT DEFAULT '',
    etiqueta TEXT DEFAULT '',
    pregunta_dato TEXT DEFAULT '',
    pregunta_at TEXT DEFAULT '',
    notified_at TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, group_key)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS bandeja_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanda_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'comment',
    thread_key TEXT NOT NULL DEFAULT '',
    comment_id TEXT NOT NULL DEFAULT '',
    last_msg_id TEXT DEFAULT '',
    author_username TEXT DEFAULT '',
    author_id TEXT DEFAULT '',
    text TEXT DEFAULT '',
    draft TEXT DEFAULT '',
    clase TEXT NOT NULL DEFAULT 'normal',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    falta_dato TEXT DEFAULT '',
    resolucion TEXT DEFAULT '',
    edited INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    last_in_at TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT DEFAULT '',
    UNIQUE(user_id, source, thread_key)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bandeja_items_user ON bandeja_items(user_id, estado)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bandeja_items_tanda ON bandeja_items(tanda_id, estado)`);
  // (BANDEJA-VERDAD) Migración: last_in_at guarda el instante del
  // último mensaje ENTRANTE del hilo (la ventana de 24 h de los DMs
  // se mide desde ahí). Las filas viejas quedan '' y la enviabilidad
  // cae a created_at como aproximación.
  try {
    const cols = db.prepare(`PRAGMA table_info(bandeja_items)`).all().map(c => c.name);
    if (!cols.includes('last_in_at')) db.exec(`ALTER TABLE bandeja_items ADD COLUMN last_in_at TEXT DEFAULT ''`);
    // (MEDIDA-TANDA) resolucion: el resultado del ítem registrado en
    // el acto de resolver ('' = todavía no resuelto, o resuelto antes
    // de este lote: la historia vieja no se reescribe).
    if (!cols.includes('resolucion')) db.exec(`ALTER TABLE bandeja_items ADD COLUMN resolucion TEXT DEFAULT ''`);
  } catch (e) {}
  // (MEDIDA-TANDA) La pregunta de la semana vive en la tanda.
  try {
    const colsT = db.prepare(`PRAGMA table_info(bandeja_tandas)`).all().map(c => c.name);
    if (!colsT.includes('pregunta_dato')) db.exec(`ALTER TABLE bandeja_tandas ADD COLUMN pregunta_dato TEXT DEFAULT ''`);
    if (!colsT.includes('pregunta_at')) db.exec(`ALTER TABLE bandeja_tandas ADD COLUMN pregunta_at TEXT DEFAULT ''`);
  } catch (e) {}
  // (MEDIDA-TANDA) Hechos de falta-dato: UN registro por ítem y dato,
  // con la fecha de su primera caída. Es la memoria que falta_dato no
  // tiene (la marca del ítem se borra al editarlo o al conseguir
  // texto): de acá salen el conteo por negocio y la pregunta.
  db.exec(`CREATE TABLE IF NOT EXISTS bandeja_falta_dato_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tanda_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    dato TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bandeja_falta_user ON bandeja_falta_dato_log(user_id, created_at)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bandeja_falta_item_dato ON bandeja_falta_dato_log(item_id, dato)`);
  // (CAMPANA-LIMPIABLE) La marca de lectura de las NOVEDADES: una
  // fila por usuario con el instante hasta el que las novedades ya
  // se vieron. Antes de este lote las novedades no tenían estado de
  // lectura en ningún lado: la pantalla las recomponía en cada
  // visita y no existía forma de «limpiarlas» (defecto del 23/11).
  db.exec(`CREATE TABLE IF NOT EXISTS bandeja_novedades_vistas (
    user_id INTEGER PRIMARY KEY,
    hasta TEXT NOT NULL DEFAULT ''
  )`);
}

// ---------------------------------------------------------------------------
// Clasificación (determinística, sin IA)
//   spam       → links/promo: se oculta, no se responde
//   importante → sensible o de plata: arriba, marcada, CON borrador
//   normal     → el resto
// ---------------------------------------------------------------------------
const SPAM_RE = /(https?:\/\/|www\.|seguidores\s+(gratis|baratos)|gan[aá]\s+dinero|cripto|onlyfans|follow\s*for\s*follow|comprar\s+seguidores|hacete\s+rico)/i;
const PLATA_RE = /(me\s+cobraron|cobraron\s+dos|doble\s+cobro|cobro\s+duplicado|devoluci[oó]n|devuelv[ae]n|reembolso|me\s+deben|no\s+me\s+devolvieron|estafa|me\s+cargaron)/i;
const SENSIBLE_RE = /(reclamo|denuncia|abogado|defensa\s+del\s+consumidor|p[eé]simo|horrible|nunca\s+m[aá]s|no\s+recomiendo|me\s+mintieron|queja|asco|verg[uü]enza|ladrones|chanta|pelotudo|idiota|forro|mierda|estafaron)/i;

function clasificar(text) {
  const t = String(text || '');
  if (SPAM_RE.test(t)) return 'spam';
  if (PLATA_RE.test(t) || SENSIBLE_RE.test(t)) return 'importante';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Errores de Meta: permiso vs. conexión
// ---------------------------------------------------------------------------
function esErrorPermiso(msg) {
  const m = String(msg || '');
  if (/\(#200\)|\(#10\)|permission|manage_messages|manage_comments|no tiene permiso|not authorized/i.test(m)) return true;
  return false;
}
function esErrorToken(msg) {
  return /\(#190\)|session has expired|access token/i.test(String(msg || ''));
}

// ---------------------------------------------------------------------------
// (BANDEJA-VERDAD) Enviabilidad y errores con nombre propio.
// Ningún error crudo de Meta se guarda en note ni llega a la pantalla:
// mapearErrorEnvio es la ÚNICA puerta de salida de un e.message.
// ---------------------------------------------------------------------------
const VENTANA_DM_MS = 24 * 3600 * 1000;
const NOTA_VENTANA = 'Este mensaje llegó hace más de 24 horas: Instagram ya no deja responderlo por acá';
const NOTA_PERMISO = 'Falta el permiso de Instagram para enviar: quedó guardada, no salió.';
const NOTA_ENVIO_GENERICA = 'Instagram no lo dejó salir';

function esErrorVentana(msg) {
  return /allowed window|outside.{0,30}window|24[ -]?hour/i.test(String(msg || ''));
}

function mapearErrorEnvio(msg) {
  const m = String(msg || '');
  if (esErrorVentana(m)) return NOTA_VENTANA;
  if (esErrorPermiso(m)) return NOTA_PERMISO;
  return NOTA_ENVIO_GENERICA;
}

// Acepta el ISO de la Graph API y el 'YYYY-MM-DD HH:MM:SS' (UTC) de
// datetime('now'). Sin fecha parseable → 0 (no se puede probar viejo).
function parseFechaMs(s) {
  const t = String(s || '').trim();
  if (!t) return 0;
  let ms = Date.parse(t);
  if (isNaN(ms)) ms = Date.parse(t.replace(' ', 'T') + 'Z');
  return isNaN(ms) ? 0 : ms;
}

// El instante desde el que corre la ventana: el último mensaje
// entrante guardado; en filas viejas sin ese dato, la creación del
// ítem (la ingesta corre cerca del mensaje: es la mejor aproximación
// que existe y jamás bloquea algo que no se puede probar viejo).
function refEntranteMs(item) {
  return parseFechaMs(item && item.last_in_at) || parseFechaMs(item && item.created_at);
}

function dmFueraDeVentana(item, nowMs) {
  if (!item || item.source !== 'dm') return false;
  const ref = refEntranteMs(item);
  if (!ref) return false;
  return (Number(nowMs) || Date.now()) - ref > VENTANA_DM_MS;
}

// Causa terminal de un ítem: la que ningún reintento puede curar.
// 'ventana' — el DM quedó fuera de las 24 h (por su reloj o porque
// Meta ya lo rechazó con ese error, guardado crudo o ya mapeado).
// 'permiso' — Meta cortó por permiso (ídem, en cualquiera de sus
// formas guardadas). Todo lo demás es reintentable.
function causaTerminal(item, nowMs) {
  if (!item) return null;
  if (dmFueraDeVentana(item, nowMs)) return 'ventana';
  if (item.estado === 'error') {
    const note = String(item.note || '');
    if (item.source === 'dm' && (esErrorVentana(note) || note === NOTA_VENTANA)) return 'ventana';
    if (esErrorPermiso(note) || note === NOTA_PERMISO || /permiso/i.test(note)) return 'permiso';
  }
  return null;
}

function motivoBloqueo(item, nowMs) {
  const c = causaTerminal(item, nowMs);
  if (c === 'ventana') return NOTA_VENTANA;
  if (c === 'permiso') return NOTA_PERMISO;
  return '';
}

// La fórmula retirada, para purgar el stock guardado. Vive en
// generator.js (REPLY_FORMULA_RE, la misma del candado de generación
// de v1236): se resuelve por deps o por require perezoso para no
// crear un segundo patrón que pueda derivar.
function formulaReDe(deps) {
  if (deps && deps.formulaRe && typeof deps.formulaRe.test === 'function') return deps.formulaRe;
  try { return require('./generator').REPLY_FORMULA_RE || null; } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Fetchers por defecto contra la Graph API (inyectables en tests)
// ---------------------------------------------------------------------------
async function igReq(path, accessToken, opts) {
  const o = opts || {};
  const url = `${IG_HOST}/${API_VERSION}${path}`;
  const init = { signal: AbortSignal.timeout(IG_TIMEOUT_MS), method: o.method || 'GET', headers: {} };
  if (o.method === 'POST') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify({ ...(o.body || {}), access_token: accessToken });
  } else {
    const qs = new URLSearchParams(o.params || {});
    qs.set('access_token', accessToken);
    const res = await fetch(`${url}?${qs}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('ig_' + res.status));
    return data;
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('ig_' + res.status));
  return data;
}

const defaultFetchers = {
  async fetchMedia(creds) {
    const d = await igReq(`/${creds.igUserId}/media`, creds.accessToken, {
      params: { fields: 'id,caption,media_url,thumbnail_url,timestamp', limit: String(MAX_POSTS_SCAN) },
    });
    return (d.data || []).map(m => ({
      id: String(m.id), caption: String(m.caption || ''),
      thumb: String(m.thumbnail_url || m.media_url || ''), timestamp: String(m.timestamp || ''),
    }));
  },
  async fetchComments(creds, mediaId) {
    const d = await igReq(`/${mediaId}/comments`, creds.accessToken, {
      params: { fields: 'id,text,username,timestamp,replies{id,text,username,timestamp}', limit: String(MAX_COMMENTS) },
    });
    return (d.data || []).map(c => ({
      id: String(c.id), text: String(c.text || ''), username: String(c.username || ''), timestamp: String(c.timestamp || ''),
      replies: ((c.replies && c.replies.data) || []).map(r => ({
        id: String(r.id), text: String(r.text || ''), username: String(r.username || ''), timestamp: String(r.timestamp || ''),
      })),
    }));
  },
  async fetchConversations(creds) {
    const d = await igReq(`/${creds.igUserId}/conversations`, creds.accessToken, {
      params: { platform: 'instagram', fields: 'id,participants{id,username},messages.limit(25){id,message,from{id,username},created_time}' },
    });
    return (d.data || []).map(cv => ({
      id: String(cv.id),
      participants: ((cv.participants && cv.participants.data) || []).map(p => ({ id: String(p.id), username: String(p.username || '') })),
      messages: ((cv.messages && cv.messages.data) || []).map(m => ({
        id: String(m.id), text: String(m.message || ''),
        fromId: String((m.from && m.from.id) || ''), fromUsername: String((m.from && m.from.username) || ''),
        created_time: String(m.created_time || ''),
      })),
    }));
  },
  async sendCommentReply(creds, commentId, text) {
    const d = await igReq(`/${commentId}/replies`, creds.accessToken, { method: 'POST', body: { message: String(text).slice(0, 1000) } });
    return { id: String(d.id || '') };
  },
  async sendDm(creds, recipientId, text) {
    const d = await igReq(`/${creds.igUserId}/messages`, creds.accessToken, {
      method: 'POST', body: { recipient: { id: String(recipientId) }, message: { text: String(text).slice(0, 1000) } },
    });
    return { id: String(d.id || '') };
  },
  async hideComment(creds, commentId) {
    await igReq(`/${commentId}`, creds.accessToken, { method: 'POST', body: { hide: true } });
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Helpers de tanda / ítem
// ---------------------------------------------------------------------------
function getOrCreateTanda(db, uid, t) {
  const ins = db.prepare(`INSERT OR IGNORE INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, etiqueta)
    VALUES (?,?,?,?,?,?,?)`).run(uid, t.groupKey, t.kind || 'post', t.postIgId || '', String(t.postCaption || '').slice(0, 300), t.postThumb || '', t.etiqueta || '');
  const row = db.prepare('SELECT * FROM bandeja_tandas WHERE user_id = ? AND group_key = ?').get(uid, t.groupKey);
  if (t.postCaption && row.post_caption !== String(t.postCaption).slice(0, 300)) {
    db.prepare('UPDATE bandeja_tandas SET post_caption = ? WHERE id = ?').run(String(t.postCaption).slice(0, 300), row.id);
  }
  // (MEDIDA-TANDA) Una tanda que NACE puede abrir con la pregunta de
  // la semana de ese negocio (el dato que más faltó). Las que ya
  // existían no se tocan: la pregunta es de la tanda siguiente.
  if (Number(ins.changes) > 0) {
    try { asegurarPreguntaTanda(db, row); } catch (e) {}
  }
  return row;
}

function touchTanda(db, tandaId) {
  db.prepare(`UPDATE bandeja_tandas SET updated_at = datetime('now') WHERE id = ?`).run(tandaId);
}

// Arma el borrador con el redactor CON FUNDAMENTO (suggestReplyDetailed
// vía deps.suggestFn). Devuelve { draft, faltaDato } — sin inventar jamás.
async function prepararBorrador(deps, uid, args) {
  const fn = deps.suggestFn ? deps.suggestFn(uid) : null;
  const apiKey = deps.apiKeyOf ? deps.apiKeyOf(uid) : '';
  if (!fn) return { draft: '', faltaDato: 'fundamento' };
  // (BANDEJA-VOZ) El caption del posteo comentado viaja al redactor como
  // ancla: estaba guardado en la tanda y nunca llegaba al prompt.
  const r = await fn({ business: args.business, category: args.category, tone: args.tone, username: args.username, commentText: args.text, postCaption: args.postCaption || '' }, apiKey);
  const o = (r && typeof r === 'object') ? r : { reply: String(r || ''), needsHuman: false, reason: '' };
  if (o.needsHuman) {
    const reason = String(o.reason || '');
    let falta = 'dato';
    if (/precio/.test(reason)) falta = 'precio';
    else if (/horario/.test(reason)) falta = 'horario';
    else if (/fundamento/.test(reason)) falta = 'fundamento';
    return { draft: '', faltaDato: falta };
  }
  return { draft: String(o.reply || '').slice(0, 300), faltaDato: '' };
}

// ---------------------------------------------------------------------------
// (MEDIDA-TANDA) Registro de falta-dato y medida por negocio.
// ---------------------------------------------------------------------------
// Anota el hecho «este ítem cayó en falta de ESTE dato» — una sola
// vez por ítem y dato (índice único), con la fecha de la primera
// caída. Se llama desde cada punto donde un ítem QUEDA con
// falta_dato puesto (ingesta, re-preparación y purga). Sin dato o
// sin ítem, no anota. Nunca lanza: medir no puede romper la bandeja.
function registrarFaltaDato(db, item) {
  const dato = String((item && item.falta_dato) || '').trim();
  if (!dato || !item || !item.id) return;
  try {
    db.prepare(`INSERT OR IGNORE INTO bandeja_falta_dato_log (user_id, tanda_id, item_id, dato) VALUES (?,?,?,?)`)
      .run(item.user_id, item.tanda_id, item.id, dato);
  } catch (e) {}
}

// La medida de un conjunto (una tanda o un negocio entero): los tres
// números de resolución + las faltas (ítems únicos y por dato).
// whereSql trae UN solo placeholder posicional ('tanda_id = ?' o
// 'user_id = ?') y vale para bandeja_items y para el log.
function medidaDesde(db, whereSql, arg) {
  const out = { tal_cual: 0, editados: 0, descartados: 0, falta_dato: { items: 0, por_dato: {}, dato_top: '' } };
  try {
    const rows = db.prepare(`SELECT resolucion, COUNT(*) AS n FROM bandeja_items WHERE ${whereSql} AND resolucion != '' GROUP BY resolucion`).all(arg);
    for (const r of rows) {
      if (r.resolucion === 'tal_cual') out.tal_cual = Number(r.n || 0);
      else if (r.resolucion === 'editado') out.editados = Number(r.n || 0);
      else if (r.resolucion === 'descartado') out.descartados = Number(r.n || 0);
    }
  } catch (e) {}
  try {
    const porDato = db.prepare(`SELECT dato, COUNT(DISTINCT item_id) AS items FROM bandeja_falta_dato_log WHERE ${whereSql} GROUP BY dato ORDER BY items DESC, dato ASC`).all(arg);
    for (const r of porDato) out.falta_dato.por_dato[r.dato] = Number(r.items || 0);
    if (porDato.length) out.falta_dato.dato_top = porDato[0].dato;
    const tot = db.prepare(`SELECT COUNT(DISTINCT item_id) AS n FROM bandeja_falta_dato_log WHERE ${whereSql}`).get(arg);
    out.falta_dato.items = Number((tot && tot.n) || 0);
  } catch (e) {}
  return out;
}

function medidaTanda(db, tandaId) { return medidaDesde(db, 'tanda_id = ?', tandaId); }
function medidaUsuario(db, uid) { return medidaDesde(db, 'user_id = ?', uid); }

// El dato que más faltó en el negocio en los últimos `dias` días:
// ítems únicos por dato; desempate por la caída más reciente y por
// nombre (determinístico). Excluye la tanda dada (la que va a abrir
// con la pregunta: sus propias faltas son de la semana que viene).
function datoTopFalta(db, uid, excluirTandaId, dias) {
  const d = Math.max(1, Math.min(30, Number(dias) || 7));
  try {
    const rows = db.prepare(`SELECT dato, COUNT(DISTINCT item_id) AS items, MAX(created_at) AS ultimo
      FROM bandeja_falta_dato_log
      WHERE user_id = ? AND tanda_id != ? AND created_at >= datetime('now', '-${d} days')
      GROUP BY dato ORDER BY items DESC, ultimo DESC, dato ASC`).all(uid, excluirTandaId || 0);
    return rows.length ? { dato: rows[0].dato, items: Number(rows[0].items || 0) } : null;
  } catch (e) { return null; }
}

// La pregunta de la semana, por dato. UNA sola pregunta, en español
// (la superficie del cliente la espeja en inglés por el mismo dato).
const PREGUNTAS_DATO = {
  precio: 'Para no frenar la próxima respuesta: ¿cuál es el precio que querés que usemos cuando alguien pregunta cuánto sale?',
  horario: 'Para no frenar la próxima respuesta: ¿cuáles son los horarios del negocio?',
  fundamento: 'Para no frenar la próxima respuesta: ¿qué más tenemos que saber del negocio para responder bien sin preguntarte?',
  dato: 'Para no frenar la próxima respuesta: ¿nos completás el dato que más nos faltó esta semana?',
};
function preguntaParaDato(dato) { return PREGUNTAS_DATO[dato] || PREGUNTAS_DATO.dato; }

// Asigna a ESTA tanda la pregunta de la semana de su negocio, si
// corresponde: la tanda todavía no tiene pregunta, el negocio no
// recibió otra en los últimos 7 días (una por semana) y hay un dato
// que faltó de verdad (sin faltas, no hay pregunta). Devuelve el
// dato asignado o ''.
function asegurarPreguntaTanda(db, tanda) {
  if (!tanda || !tanda.id || tanda.pregunta_dato) return '';
  try {
    const reciente = db.prepare(`SELECT id FROM bandeja_tandas WHERE user_id = ? AND id != ? AND pregunta_at != '' AND pregunta_at >= datetime('now', '-7 days') LIMIT 1`).get(tanda.user_id, tanda.id);
    if (reciente) return '';
    const top = datoTopFalta(db, tanda.user_id, tanda.id, 7);
    if (!top || !top.dato) return '';
    db.prepare(`UPDATE bandeja_tandas SET pregunta_dato = ?, pregunta_at = datetime('now') WHERE id = ?`).run(top.dato, tanda.id);
    tanda.pregunta_dato = top.dato;
    return top.dato;
  } catch (e) { return ''; }
}

// ¿La tanda tiene que avisar? Un solo aviso por tanda: cuando aparece su
// primer ítem pendiente y notified_at sigue vacío.
function quizasAvisar(db, deps, uid, tanda) {
  if (tanda.notified_at) return;
  const n = db.prepare(`SELECT COUNT(*) AS n FROM bandeja_items WHERE tanda_id = ? AND estado = 'pendiente'`).get(tanda.id).n;
  if (!n) return;
  db.prepare(`UPDATE bandeja_tandas SET notified_at = datetime('now') WHERE id = ?`).run(tanda.id);
  tanda.notified_at = 'now';
  if (deps.notify) {
    try { deps.notify(uid, { tandaId: tanda.id, n, kind: tanda.kind }); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
// pollBandeja(db, deps, opts) — la ingesta silenciosa.
// deps: { credsOf(uid), suggestFn(uid), apiKeyOf(uid), planFilter(uid),
//         notify(uid, info), fetchers }
// opts: { onlyUser } — si está, procesa solo ese usuario.
// Nunca lanza por usuario: uno fallido no rompe el resto.
// ---------------------------------------------------------------------------
async function pollBandeja(db, deps, opts) {
  const d = deps || {};
  const F = d.fetchers || defaultFetchers;
  const out = { users: 0, nuevos: 0, repreparados: 0, yaRespondidos: 0, spam: 0, errors: [] };
  let users = [];
  try {
    if (opts && opts.onlyUser) {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(opts.onlyUser);
      users = u ? [u] : [];
    } else {
      users = db.prepare(`SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
        WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != '' AND s.ig_access_token IS NOT NULL AND s.ig_access_token != ''
        LIMIT 25`).all();
    }
  } catch (e) { out.errors.push('users: ' + e.message); return out; }

  for (const u of users) {
    const uid = u.id;
    try {
      if (d.planFilter && !(opts && opts.onlyUser)) {
        let allowed = false;
        try { allowed = !!d.planFilter(uid); } catch (e) { allowed = false; }
        if (!allowed) continue;
      }
      const creds = d.credsOf ? d.credsOf(uid) : null;
      if (!creds || !creds.igUserId || !creds.accessToken) continue;
      out.users++;
      const prof = db.prepare('SELECT business_name, category, tone, ig_username FROM profiles WHERE user_id = ?').get(uid) || {};
      const bizHandle = String(creds.igUsername || prof.ig_username || '').toLowerCase().replace(/^@/, '');
      const argsBase = { business: prof.business_name || '', category: prof.category || '', tone: prof.tone || '' };
      const since = Date.now() - SINCE_MS;
      const tandasTocadas = new Set();

      // ---- Comentarios (por posteo) ----
      let media = [];
      try { media = await F.fetchMedia(creds); } catch (e) { out.errors.push(`uid ${uid} media: ${e.message}`); media = []; }
      for (const m of media) {
        let comments = [];
        try { comments = await F.fetchComments(creds, m.id); } catch (e) { continue; }
        const tanda = getOrCreateTanda(db, uid, { groupKey: m.id, kind: 'post', postIgId: m.id, postCaption: m.caption, postThumb: m.thumb });
        for (const c of comments) {
          if (!c.text || !c.username) continue;
          if (c.timestamp && new Date(c.timestamp).getTime() < since) continue;
          if (bizHandle && c.username.toLowerCase() === bizHandle) continue; // comentario del propio negocio
          const hilo = [c, ...(c.replies || [])];
          const negocioRespondio = bizHandle && hilo.some(r => String(r.username || '').toLowerCase() === bizHandle);
          const entrantes = hilo.filter(r => !bizHandle || String(r.username || '').toLowerCase() !== bizHandle);
          if (!entrantes.length) continue;
          const ultimo = entrantes[entrantes.length - 1];
          const existing = db.prepare(`SELECT * FROM bandeja_items WHERE user_id = ? AND source = 'comment' AND thread_key = ?`).get(uid, c.id);

          // FRENO (1) al ingresar: el negocio ya respondió desde IG.
          if (negocioRespondio) {
            if (existing && ['pendiente', 'sin_permiso', 'error'].includes(existing.estado)) {
              db.prepare(`UPDATE bandeja_items SET estado = 'ya_respondido', decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(existing.id);
              out.yaRespondidos++; tandasTocadas.add(tanda.id);
            } else if (!existing) {
              db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, decided_at, last_in_at)
                VALUES (?,?, 'comment', ?, ?, ?, ?, ?, '', 'normal', 'ya_respondido', datetime('now'), ?)`)
                .run(tanda.id, uid, c.id, c.id, ultimo.id, c.username, String(ultimo.text).slice(0, 500), String(ultimo.timestamp || c.timestamp || ''));
              out.yaRespondidos++; tandasTocadas.add(tanda.id);
            }
            continue;
          }

          if (existing) {
            // FRENO (3): escribió de nuevo en el hilo → re-preparar.
            if (['pendiente', 'sin_permiso', 'error'].includes(existing.estado) && ultimo.id !== existing.last_msg_id) {
              const contexto = entrantes.map(r => `@${r.username}: ${r.text}`).join('\n').slice(0, 600);
              if (existing.edited) {
                db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, last_in_at = ?, actualizado = 1, note = 'La persona escribió de nuevo en el hilo: revisá tu respuesta.', updated_at = datetime('now') WHERE id = ?`)
                  .run(ultimo.id, String(ultimo.text).slice(0, 500), String(ultimo.timestamp || c.timestamp || ''), existing.id);
              } else {
                const prep = await prepararBorrador(d, uid, { ...argsBase, username: c.username, text: contexto, postCaption: m.caption || '' });
                db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, last_in_at = ?, draft = ?, falta_dato = ?, actualizado = 1, estado = 'pendiente', updated_at = datetime('now') WHERE id = ?`)
                  .run(ultimo.id, String(ultimo.text).slice(0, 500), String(ultimo.timestamp || c.timestamp || ''), prep.draft, prep.faltaDato, existing.id);
                registrarFaltaDato(db, { id: existing.id, user_id: uid, tanda_id: tanda.id, falta_dato: prep.faltaDato });
              }
              out.repreparados++; tandasTocadas.add(tanda.id);
            }
            continue;
          }

          // Hilo nuevo.
          const clase = clasificar(c.text);
          if (clase === 'spam') {
            try { await F.hideComment(creds, c.id); } catch (e) { /* sin permiso de ocultar: queda registrado igual */ }
            db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, note, decided_at)
              VALUES (?,?, 'comment', ?, ?, ?, ?, ?, '', 'spam', 'oculto', 'Spam: oculto, no se responde.', datetime('now'))`)
              .run(tanda.id, uid, c.id, c.id, ultimo.id, c.username, String(c.text).slice(0, 500));
            out.spam++; tandasTocadas.add(tanda.id);
            continue;
          }
          const prep = await prepararBorrador(d, uid, { ...argsBase, username: c.username, text: c.text, postCaption: m.caption || '' });
          db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato, last_in_at)
            VALUES (?,?, 'comment', ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`)
            .run(tanda.id, uid, c.id, c.id, ultimo.id, c.username, String(c.text).slice(0, 500), prep.draft, clase, prep.faltaDato, String(ultimo.timestamp || c.timestamp || ''));
          if (prep.faltaDato) {
            const ni = db.prepare(`SELECT id FROM bandeja_items WHERE user_id = ? AND source = 'comment' AND thread_key = ?`).get(uid, c.id);
            if (ni) registrarFaltaDato(db, { id: ni.id, user_id: uid, tanda_id: tanda.id, falta_dato: prep.faltaDato });
          }
          out.nuevos++; tandasTocadas.add(tanda.id);
        }
        if (tandasTocadas.has(tanda.id)) touchTanda(db, tanda.id);
        quizasAvisar(db, d, uid, tanda);
      }

      // ---- DMs (por conversación) ----
      let convs = [];
      try { convs = await F.fetchConversations(creds); } catch (e) { convs = []; /* sin permiso de mensajes: los comentarios ya entraron */ }
      for (const cv of convs) {
        const msgs = cv.messages || [];
        if (!msgs.length) continue;
        const otro = (cv.participants || []).find(p => String(p.id) !== String(creds.igUserId)) || {};
        const last = msgs[0]; // la API devuelve del más nuevo al más viejo
        if (!last || !last.id) continue;
        if (last.created_time && new Date(last.created_time).getTime() < since) continue;
        const tanda = getOrCreateTanda(db, uid, { groupKey: 'dm:' + cv.id, kind: 'dm', etiqueta: otro.username ? '@' + otro.username : 'Mensaje directo' });
        const existing = db.prepare(`SELECT * FROM bandeja_items WHERE user_id = ? AND source = 'dm' AND thread_key = ?`).get(uid, cv.id);
        const negocioMandoUltimo = String(last.fromId) === String(creds.igUserId);

        // FRENO (1) en DMs: si el último mensaje lo mandó el negocio, ya respondió.
        if (negocioMandoUltimo) {
          if (existing && ['pendiente', 'sin_permiso', 'error'].includes(existing.estado)) {
            db.prepare(`UPDATE bandeja_items SET estado = 'ya_respondido', decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(existing.id);
            out.yaRespondidos++; touchTanda(db, tanda.id);
          }
          continue;
        }
        if (!last.text) continue;
        const username = last.fromUsername || otro.username || '';
        if (existing) {
          // FRENO (3) en DMs: mensaje nuevo en la conversación.
          if (['pendiente', 'sin_permiso', 'error'].includes(existing.estado) && last.id !== existing.last_msg_id) {
            const contexto = msgs.filter(m => String(m.fromId) !== String(creds.igUserId)).slice(0, 4).reverse().map(m => `@${m.fromUsername || username}: ${m.text}`).join('\n').slice(0, 600);
            if (existing.edited) {
              db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, last_in_at = ?, author_id = ?, actualizado = 1, note = 'La persona escribió de nuevo: revisá tu respuesta.', updated_at = datetime('now') WHERE id = ?`)
                .run(last.id, String(last.text).slice(0, 500), String(last.created_time || ''), String(last.fromId || ''), existing.id);
            } else {
              const prep = await prepararBorrador(d, uid, { ...argsBase, username, text: contexto });
              db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, last_in_at = ?, author_id = ?, draft = ?, falta_dato = ?, actualizado = 1, estado = 'pendiente', updated_at = datetime('now') WHERE id = ?`)
                .run(last.id, String(last.text).slice(0, 500), String(last.created_time || ''), String(last.fromId || ''), prep.draft, prep.faltaDato, existing.id);
              registrarFaltaDato(db, { id: existing.id, user_id: uid, tanda_id: tanda.id, falta_dato: prep.faltaDato });
            }
            out.repreparados++; touchTanda(db, tanda.id);
          }
          continue;
        }
        const clase = clasificar(last.text);
        if (clase === 'spam') {
          // En DMs el spam no se oculta en silencio (doctrina de la casa):
          // entra sin borrador, marcado, y lo decide el dueño.
          db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, note, last_in_at)
            VALUES (?,?, 'dm', ?, ?, ?, ?, ?, ?, '', 'spam', 'pendiente', 'Posible spam: sin borrador preparado.', ?)`)
            .run(tanda.id, uid, cv.id, last.id, last.id, username, String(last.fromId || ''), String(last.text).slice(0, 500), String(last.created_time || ''));
          out.nuevos++; touchTanda(db, tanda.id);
          continue;
        }
        const prep = await prepararBorrador(d, uid, { ...argsBase, username, text: last.text });
        db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, falta_dato, last_in_at)
          VALUES (?,?, 'dm', ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`)
          .run(tanda.id, uid, cv.id, last.id, last.id, username, String(last.fromId || ''), String(last.text).slice(0, 500), prep.draft, clase, prep.faltaDato, String(last.created_time || ''));
        if (prep.faltaDato) {
          const ni = db.prepare(`SELECT id FROM bandeja_items WHERE user_id = ? AND source = 'dm' AND thread_key = ?`).get(uid, cv.id);
          if (ni) registrarFaltaDato(db, { id: ni.id, user_id: uid, tanda_id: tanda.id, falta_dato: prep.faltaDato });
        }
        out.nuevos++; touchTanda(db, tanda.id);
        quizasAvisar(db, d, uid, tanda);
      }
    } catch (e) {
      out.errors.push(`uid ${uid}: ${e.message}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// refreshTanda(db, uid, tandaId, deps) — FRENO (1) al abrir la revisión:
// re-lee el hilo en vivo y saca de la tanda lo que el negocio ya
// respondió desde Instagram. Best-effort: si la API falla, la revisión
// se sirve igual con lo guardado.
// ---------------------------------------------------------------------------
async function refreshTanda(db, uid, tandaId, deps) {
  const d = deps || {};
  const F = d.fetchers || defaultFetchers;
  const tanda = db.prepare('SELECT * FROM bandeja_tandas WHERE id = ? AND user_id = ?').get(tandaId, uid);
  if (!tanda) return { ok: false };
  const creds = d.credsOf ? d.credsOf(uid) : null;
  if (!creds) return { ok: false };
  const prof = db.prepare('SELECT ig_username FROM profiles WHERE user_id = ?').get(uid) || {};
  const bizHandle = String(creds.igUsername || prof.ig_username || '').toLowerCase().replace(/^@/, '');
  let flips = 0;
  try {
    if (tanda.kind === 'post') {
      const comments = await F.fetchComments(creds, tanda.post_ig_id);
      const respondidos = new Set();
      for (const c of comments) {
        const hilo = [c, ...(c.replies || [])];
        if (bizHandle && hilo.some(r => String(r.username || '').toLowerCase() === bizHandle)) respondidos.add(c.id);
      }
      const items = db.prepare(`SELECT * FROM bandeja_items WHERE tanda_id = ? AND estado IN ('pendiente','sin_permiso','error')`).all(tandaId);
      for (const it of items) {
        if (respondidos.has(it.thread_key)) {
          db.prepare(`UPDATE bandeja_items SET estado = 'ya_respondido', decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(it.id);
          flips++;
        }
      }
    } else {
      const convs = await F.fetchConversations(creds);
      const conv = convs.find(cv => 'dm:' + cv.id === tanda.group_key);
      if (conv && conv.messages && conv.messages.length) {
        const last = conv.messages[0];
        if (String(last.fromId) === String(creds.igUserId)) {
          const r = db.prepare(`UPDATE bandeja_items SET estado = 'ya_respondido', decided_at = datetime('now'), updated_at = datetime('now') WHERE tanda_id = ? AND estado IN ('pendiente','sin_permiso','error')`).run(tandaId);
          flips = Number(r.changes || 0);
        }
      }
    }
  } catch (e) { /* best-effort */ }
  if (flips) touchTanda(db, tandaId);
  return { ok: true, flips };
}

// ---------------------------------------------------------------------------
// Lectura para la pantalla
// ---------------------------------------------------------------------------
function tandaConItems(db, tanda) {
  const now = Date.now();
  const items = db.prepare(`SELECT * FROM bandeja_items WHERE tanda_id = ? AND estado != 'oculto'
    ORDER BY (clase = 'importante') DESC,
             (estado IN ('pendiente','sin_permiso','error')) DESC,
             created_at ASC, id ASC`).all(tanda.id);
  // (BANDEJA-VERDAD) Lo que se sirve ya viene con la verdad puesta:
  // cada ítem pendiente lleva su bloqueo (si lo tiene) y su nota
  // visible — un error crudo de Meta guardado antes de este lote se
  // mapea a español ACÁ, en la lectura, y un DM fuera de ventana dice
  // su verdad aunque su nota guardada diga otra cosa.
  for (const it of items) {
    const esPend = ['pendiente', 'sin_permiso', 'error'].includes(it.estado);
    it.bloqueo_motivo = esPend ? motivoBloqueo(it, now) : '';
    it.enviable = esPend && !it.bloqueo_motivo;
    if (esPend && it.bloqueo_motivo === NOTA_VENTANA) {
      it.note = NOTA_VENTANA;
    } else if (it.note && (esErrorVentana(it.note) || esErrorPermiso(it.note))) {
      it.note = mapearErrorEnvio(it.note);
    }
  }
  const pend = items.filter(i => ['pendiente', 'sin_permiso', 'error'].includes(i.estado));
  return {
    ...tanda,
    items,
    // (MEDIDA-TANDA) La medida de ESTA tanda y, si le tocó, la
    // pregunta de la semana (el dato que más faltó en el negocio):
    // la tanda abre pidiéndolo, en el mismo flujo.
    medida: medidaTanda(db, tanda.id),
    pregunta_dato: tanda.pregunta_dato ? { dato: tanda.pregunta_dato, texto: preguntaParaDato(tanda.pregunta_dato) } : null,
    conteo: {
      // para_salir = lo que approveTanda realmente puede enviar:
      // con borrador Y sin bloqueo terminal. Ni uno más.
      para_salir: pend.filter(i => String(i.draft || '').trim() && !i.bloqueo_motivo).length,
      // (CAMPANA-LIMPIABLE) accionables = lo que espera un toque del
      // dueño DE VERDAD: en estado de salida y sin bloqueo terminal
      // (con o sin borrador: el que espera un dato también se actúa,
      // escribiéndolo). Es el número que decide si la tarjeta se
      // pinta bajo «ESPERA TU TOQUE» y el que alimenta la campana.
      accionables: pend.filter(i => !i.bloqueo_motivo).length,
      bloqueadas: pend.filter(i => i.bloqueo_motivo).length,
      esperando_dato: pend.filter(i => !String(i.draft || '').trim() && i.falta_dato).length,
      pendientes: pend.length,
      importantes: pend.filter(i => i.clase === 'importante').length,
      descartadas: items.filter(i => i.estado === 'descartado').length,
      editadas: pend.filter(i => i.edited).length,
      ya_respondidas: items.filter(i => i.estado === 'ya_respondido').length,
      enviadas: items.filter(i => i.estado === 'enviado').length,
    },
  };
}

function getBandeja(db, uid) {
  const tandas = db.prepare('SELECT * FROM bandeja_tandas WHERE user_id = ? ORDER BY updated_at DESC').all(uid)
    .map(t => tandaConItems(db, t))
    .filter(t => t.items.length > 0);
  return { tandas, acciones: countAcciones(db, uid) };
}

// ---------------------------------------------------------------------------
// (BANDEJA-VERDAD) Purga de la fórmula guardada. Barre los borradores
// pendientes cuyo texto matchea REPLY_FORMULA_RE y los regenera con el
// redactor actual (prepararBorrador, con fundamento): si la
// regeneración da texto limpio, el borrador se reemplaza; si da
// vacío/needs-human, el borrador queda '' con su marca de falta-dato.
// Un borrador EDITADO por el dueño es suyo: no se toca. Corre al
// desplegar (scheduler) y como guarda en la lectura (GET /api/bandeja,
// por usuario). Nunca lanza: un ítem fallido no rompe el barrido.
// ---------------------------------------------------------------------------
async function purgarBorradoresFormula(db, deps, opts) {
  const d = deps || {};
  const re = formulaReDe(d);
  const out = { revisados: 0, regenerados: 0, vaciados: 0, sin_patron: 0 };
  if (!re) { out.sin_patron = 1; return out; }
  const onlyUser = opts && opts.onlyUser ? Number(opts.onlyUser) : 0;
  let items = [];
  try {
    items = db.prepare(`SELECT * FROM bandeja_items
      WHERE estado IN ('pendiente','sin_permiso','error') AND edited = 0 AND draft != ''
      ${onlyUser ? 'AND user_id = ?' : ''} ORDER BY id ASC`).all(...(onlyUser ? [onlyUser] : []));
  } catch (e) { return out; }
  for (const it of items) {
    if (!re.test(String(it.draft || ''))) continue;
    out.revisados++;
    try {
      const prof = db.prepare('SELECT business_name, category, tone FROM profiles WHERE user_id = ?').get(it.user_id) || {};
      const tanda = db.prepare('SELECT post_caption FROM bandeja_tandas WHERE id = ?').get(it.tanda_id) || {};
      const prep = await prepararBorrador(d, it.user_id, {
        business: prof.business_name || '', category: prof.category || '', tone: prof.tone || '',
        username: it.author_username || '', text: it.text || '',
        postCaption: it.source === 'comment' ? (tanda.post_caption || '') : '',
      });
      if (prep.draft && !re.test(prep.draft)) {
        db.prepare(`UPDATE bandeja_items SET draft = ?, falta_dato = '', updated_at = datetime('now') WHERE id = ?`).run(prep.draft, it.id);
        out.regenerados++;
      } else {
        db.prepare(`UPDATE bandeja_items SET draft = '', falta_dato = ?, updated_at = datetime('now') WHERE id = ?`).run(prep.faltaDato || 'dato', it.id);
        registrarFaltaDato(db, { id: it.id, user_id: it.user_id, tanda_id: it.tanda_id, falta_dato: prep.faltaDato || 'dato' });
        out.vaciados++;
      }
    } catch (e) {
      // Sin redactor disponible: el borrador-fórmula NO se sirve —
      // queda vacío con su marca, y el dueño lo completa al editar.
      try {
        db.prepare(`UPDATE bandeja_items SET draft = '', falta_dato = 'dato', updated_at = datetime('now') WHERE id = ?`).run(it.id);
        registrarFaltaDato(db, { id: it.id, user_id: it.user_id, tanda_id: it.tanda_id, falta_dato: 'dato' });
        out.vaciados++;
      } catch (e2) {}
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (BANDEJA-VERDAD) Censo agregado de la bandeja para la lectura admin:
// ítems por estado, los que están en error con su nota, y el stock de
// borradores que todavía matchean la fórmula (por usuario y por
// antigüedad). Solo lectura: no escribe ni regenera nada.
// ---------------------------------------------------------------------------
function censoBandeja(db, deps) {
  const re = formulaReDe(deps || {});
  const ahora = Date.now();
  const porUsuario = new Map();
  const fila = (uid) => {
    if (!porUsuario.has(uid)) {
      porUsuario.set(uid, {
        user_id: uid, por_estado: {}, en_error: [],
        formula: { cantidad: 0, mas_viejo: '', antiguedad_horas: 0 },
        bloqueadas_ventana: 0,
        medida: null,
      });
    }
    return porUsuario.get(uid);
  };
  let items = [];
  try {
    items = db.prepare(`SELECT id, user_id, source, estado, note, draft, created_at, last_in_at
      FROM bandeja_items WHERE estado != 'oculto' ORDER BY user_id ASC, id ASC`).all();
  } catch (e) { items = []; }
  for (const it of items) {
    const f = fila(it.user_id);
    f.por_estado[it.estado] = (f.por_estado[it.estado] || 0) + 1;
    if (it.estado === 'error') {
      f.en_error.push({ id: it.id, source: it.source, note: String(it.note || ''), note_visible: mapearErrorEnvio(it.note), created_at: it.created_at });
    }
    if (['pendiente', 'sin_permiso', 'error'].includes(it.estado) && causaTerminal(it, ahora) === 'ventana') f.bloqueadas_ventana++;
    if (re && it.draft && re.test(String(it.draft))) {
      f.formula.cantidad++;
      if (!f.formula.mas_viejo || String(it.created_at) < f.formula.mas_viejo) f.formula.mas_viejo = String(it.created_at);
    }
  }
  const usuarios = [...porUsuario.values()];
  for (const f of usuarios) {
    if (f.formula.mas_viejo) {
      const ms = parseFechaMs(f.formula.mas_viejo);
      f.formula.antiguedad_horas = ms ? Math.max(0, Math.round((ahora - ms) / 360000) / 10) : 0;
    }
    // (MEDIDA-TANDA) El parte suma por negocio los tres números y
    // las faltas — cuentan desde que el lote vive (sin historia
    // reescrita: lo viejo no tiene resolucion ni hechos).
    f.medida = medidaUsuario(db, f.user_id);
  }
  const totales = { usuarios: usuarios.length, items: items.length, formula: usuarios.reduce((a, f) => a + f.formula.cantidad, 0), bloqueadas_ventana: usuarios.reduce((a, f) => a + f.bloqueadas_ventana, 0) };
  // (MEDIDA-TANDA) La medida global del parte, por la misma vía.
  totales.medida = medidaDesde(db, 'user_id != ?', 0);
  return { usuarios, totales };
}

function countAcciones(db, uid) {
  // (CAMPANA-LIMPIABLE) El número cuenta SOLO lo accionable: ítems
  // en estado de salida SIN causa terminal. La versión anterior
  // contaba el estado crudo y un DM fuera de la ventana de 24 h —
  // que approveTanda excluye para siempre — clavaba la campana en 1
  // sin ninguna acción del dueño que pudiera limpiarla (defecto del
  // 23/11 en la cuenta de la casa). Es la misma exclusión que
  // para_salir en tandaConItems, sin exigir borrador: el ítem que
  // espera un dato SÍ es accionable (el dueño lo escribe).
  const now = Date.now();
  const items = db.prepare(`SELECT source, estado, note, last_in_at, created_at FROM bandeja_items
    WHERE user_id = ? AND estado IN ('pendiente','sin_permiso','error')`).all(uid);
  return items.filter(it => !motivoBloqueo(it, now)).length;
}

// (CAMPANA-LIMPIABLE) La marca de lectura de las novedades: el
// instante hasta el que este usuario ya las vio (0 = nunca).
function novedadesVistasHastaMs(db, uid) {
  try {
    const r = db.prepare('SELECT hasta FROM bandeja_novedades_vistas WHERE user_id = ?').get(uid);
    return r ? parseFechaMs(r.hasta) : 0;
  } catch (e) { return 0; }
}

// (CAMPANA-LIMPIABLE) Abrir la pantalla de Notificaciones marca las
// novedades como vistas: la marca sube a «ahora» y el conteo de la
// campana cae en el acto. Lo que se publica DESPUÉS vuelve a contar.
function marcarNovedadesVistas(db, uid) {
  db.prepare(`INSERT INTO bandeja_novedades_vistas (user_id, hasta) VALUES (?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET hasta = datetime('now')`).run(uid);
  return conteoCampana(db, uid);
}

// (CAMPANA-LIMPIABLE) EL número de la campana, con una sola verdad:
// ítems accionables esperando el toque + novedades sin ver. Nada más.
function conteoCampana(db, uid) {
  const acciones = countAcciones(db, uid);
  const sinVer = novedades(db, uid).filter(n => !n.vista).length;
  return { acciones, novedades: sinVer, total: acciones + sinVer };
}

// NOVEDADES con datos reales de hoy: el posteo publicado y el impulso
// corriendo (las dos fuentes que existen en la base; nada inventado).
// (CAMPANA-LIMPIABLE) Cada novedad lleva su estado de lectura
// (`vista`): es vista si su instante no supera la marca del usuario
// (bandeja_novedades_vistas). Sin marca, todo es sin ver.
function novedades(db, uid) {
  const out = [];
  const hastaMs = novedadesVistasHastaMs(db, uid);
  try {
    const post = db.prepare(`SELECT caption, published_at FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at IS NOT NULL AND date(published_at) = date('now') ORDER BY published_at DESC LIMIT 1`).get(uid);
    if (post) out.push({ tipo: 'posteo', titulo: 'Tu posteo de hoy salió', detalle: String(post.caption || '').slice(0, 80), cuando: post.published_at, vista: parseFechaMs(post.published_at) <= hastaMs });
  } catch (e) {}
  try {
    const boost = db.prepare(`SELECT budget_cents, currency, duration_days, created_at FROM ad_boosts
      WHERE user_id = ? AND status IN ('active','pending') ORDER BY created_at DESC LIMIT 1`).get(uid);
    if (boost) {
      const monto = boost.currency === 'USD' ? 'US$' + Math.round((boost.budget_cents || 0) / 100) : '$' + Math.round((boost.budget_cents || 0) / 100);
      out.push({ tipo: 'impulso', titulo: 'Tu impulso está corriendo', detalle: `${monto} · ${boost.duration_days || 7} días`, cuando: boost.created_at, vista: parseFechaMs(boost.created_at) <= hastaMs });
    }
  } catch (e) {}
  return out;
}

// ---------------------------------------------------------------------------
// Acciones del dueño sobre un ítem
// ---------------------------------------------------------------------------
function editItem(db, uid, itemId, text) {
  const t = String(text || '').slice(0, 1000);
  const r = db.prepare(`UPDATE bandeja_items SET draft = ?, edited = 1, actualizado = 0,
      falta_dato = CASE WHEN ? != '' THEN '' ELSE falta_dato END,
      estado = CASE WHEN estado IN ('sin_permiso','error') THEN 'pendiente' ELSE estado END,
      updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND estado IN ('pendiente','sin_permiso','error')`).run(t, t, itemId, uid);
  return { ok: Number(r.changes) > 0 };
}

function dismissItem(db, uid, itemId) {
  // (MEDIDA-TANDA) El descarte ES la resolución: queda registrada.
  const r = db.prepare(`UPDATE bandeja_items SET estado = 'descartado', resolucion = 'descartado', updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND estado IN ('pendiente','sin_permiso','error')`).run(itemId, uid);
  return { ok: Number(r.changes) > 0 };
}

function undismissItem(db, uid, itemId) {
  // Deshacer el descarte des-resuelve: la medida lo deja de contar.
  const r = db.prepare(`UPDATE bandeja_items SET estado = 'pendiente', resolucion = '', updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND estado = 'descartado'`).run(itemId, uid);
  return { ok: Number(r.changes) > 0 };
}

// ---------------------------------------------------------------------------
// approveTanda(db, uid, tandaId, deps) — UN toque aprueba la tanda.
// Recorre el camino de envío con el FRENO (2) y la compuerta de permiso.
// ---------------------------------------------------------------------------
async function approveTanda(db, uid, tandaId, deps) {
  const d = deps || {};
  const F = d.fetchers || defaultFetchers;
  const tanda = db.prepare('SELECT * FROM bandeja_tandas WHERE id = ? AND user_id = ?').get(tandaId, uid);
  if (!tanda) throw new Error('tanda no encontrada');
  const creds = d.credsOf ? d.credsOf(uid) : null;
  if (!creds || !creds.igUserId || !creds.accessToken) throw new Error('Conectá tu Instagram en Ajustes');
  const prof = db.prepare('SELECT ig_username FROM profiles WHERE user_id = ?').get(uid) || {};
  const bizHandle = String(creds.igUsername || prof.ig_username || '').toLowerCase().replace(/^@/, '');

  const items = db.prepare(`SELECT * FROM bandeja_items WHERE tanda_id = ? AND estado IN ('pendiente','sin_permiso','error')
    ORDER BY (clase = 'importante') DESC, created_at ASC, id ASC`).all(tandaId);
  const out = { enviadas: 0, ya_respondidas: 0, sin_permiso: 0, esperando_dato: 0, errores: 0, bloqueadas: 0, motivos: [], permiso: true };
  const anotaMotivo = (m) => { if (m && !out.motivos.includes(m)) out.motivos.push(m); };

  // FRENO (2): estado fresco de los hilos, UNA lectura por tanda.
  const respondidos = new Set();
  let convNegocioUltimo = false;
  try {
    if (tanda.kind === 'post') {
      const comments = await F.fetchComments(creds, tanda.post_ig_id);
      for (const c of comments) {
        const hilo = [c, ...(c.replies || [])];
        if (bizHandle && hilo.some(r => String(r.username || '').toLowerCase() === bizHandle)) respondidos.add(c.id);
      }
    } else {
      const convs = await F.fetchConversations(creds);
      const conv = convs.find(cv => 'dm:' + cv.id === tanda.group_key);
      if (conv && conv.messages && conv.messages.length && String(conv.messages[0].fromId) === String(creds.igUserId)) convNegocioUltimo = true;
    }
  } catch (e) { /* si la re-lectura falla, el envío mismo decide ítem por ítem */ }

  let cortoPorPermiso = false;
  for (const it of items) {
    if (!String(it.draft || '').trim()) { out.esperando_dato++; continue; }
    if (cortoPorPermiso) {
      db.prepare(`UPDATE bandeja_items SET estado = 'sin_permiso', note = ?, updated_at = datetime('now') WHERE id = ?`).run(NOTA_PERMISO, it.id);
      out.sin_permiso++; continue;
    }
    if (respondidos.has(it.thread_key) || (tanda.kind === 'dm' && convNegocioUltimo)) {
      db.prepare(`UPDATE bandeja_items SET estado = 'ya_respondido', decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(it.id);
      out.ya_respondidas++; continue;
    }
    // (BANDEJA-VERDAD) Causa terminal: NO se reintenta a ciegas. El
    // ítem queda fuera del envío, su nota queda en español y el
    // resultado lo reporta como bloqueado con su motivo — la
    // pantalla nunca más promete lo que Meta ya dijo que no sale.
    const motivo = motivoBloqueo(it);
    if (motivo) {
      if (String(it.note || '') !== motivo) {
        db.prepare(`UPDATE bandeja_items SET note = ?, updated_at = datetime('now') WHERE id = ?`).run(motivo, it.id);
      }
      out.bloqueadas++; anotaMotivo(motivo); continue;
    }
    try {
      if (it.source === 'dm') await F.sendDm(creds, it.author_id, it.draft);
      else await F.sendCommentReply(creds, it.comment_id, it.draft);
      // (MEDIDA-TANDA) Lo que salió queda medido en el acto: salió
      // tal cual si el dueño nunca tocó el borrador; editado si sí.
      db.prepare(`UPDATE bandeja_items SET estado = 'enviado', resolucion = ?, decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(it.edited ? 'editado' : 'tal_cual', it.id);
      out.enviadas++;
    } catch (e) {
      if (esErrorPermiso(e.message)) {
        cortoPorPermiso = true; out.permiso = false;
        db.prepare(`UPDATE bandeja_items SET estado = 'sin_permiso', note = ?, updated_at = datetime('now') WHERE id = ?`).run(NOTA_PERMISO, it.id);
        out.sin_permiso++;
      } else {
        // (BANDEJA-VERDAD) La nota que queda guardada es la verdad
        // en español, nunca el e.message crudo de Meta.
        const notaEs = mapearErrorEnvio(e.message);
        db.prepare(`UPDATE bandeja_items SET estado = 'error', note = ?, updated_at = datetime('now') WHERE id = ?`).run(notaEs, it.id);
        out.errores++; anotaMotivo(notaEs);
      }
    }
  }
  touchTanda(db, tandaId);
  return out;
}

module.exports = {
  initBandejaTables, clasificar, esErrorPermiso, esErrorToken,
  pollBandeja, getBandeja, refreshTanda, editItem, dismissItem, undismissItem,
  approveTanda, countAcciones, novedades, defaultFetchers,
  conteoCampana, marcarNovedadesVistas,
  purgarBorradoresFormula, censoBandeja, mapearErrorEnvio, esErrorVentana,
  dmFueraDeVentana, causaTerminal, motivoBloqueo, NOTA_VENTANA, NOTA_PERMISO,
  registrarFaltaDato, medidaTanda, medidaUsuario, datoTopFalta,
  asegurarPreguntaTanda, preguntaParaDato,
};
