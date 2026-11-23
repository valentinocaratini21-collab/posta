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
// Exporta: { initBandejaTables, clasificar, esErrorPermiso,
//   pollBandeja, getBandeja, refreshTanda, editItem, dismissItem,
//   undismissItem, approveTanda, countAcciones, novedades,
//   defaultFetchers }
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
    edited INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT DEFAULT '',
    UNIQUE(user_id, source, thread_key)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bandeja_items_user ON bandeja_items(user_id, estado)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bandeja_items_tanda ON bandeja_items(tanda_id, estado)`);
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
  db.prepare(`INSERT OR IGNORE INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, etiqueta)
    VALUES (?,?,?,?,?,?,?)`).run(uid, t.groupKey, t.kind || 'post', t.postIgId || '', String(t.postCaption || '').slice(0, 300), t.postThumb || '', t.etiqueta || '');
  const row = db.prepare('SELECT * FROM bandeja_tandas WHERE user_id = ? AND group_key = ?').get(uid, t.groupKey);
  if (t.postCaption && row.post_caption !== String(t.postCaption).slice(0, 300)) {
    db.prepare('UPDATE bandeja_tandas SET post_caption = ? WHERE id = ?').run(String(t.postCaption).slice(0, 300), row.id);
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
              db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, decided_at)
                VALUES (?,?, 'comment', ?, ?, ?, ?, ?, '', 'normal', 'ya_respondido', datetime('now'))`)
                .run(tanda.id, uid, c.id, c.id, ultimo.id, c.username, String(ultimo.text).slice(0, 500));
              out.yaRespondidos++; tandasTocadas.add(tanda.id);
            }
            continue;
          }

          if (existing) {
            // FRENO (3): escribió de nuevo en el hilo → re-preparar.
            if (['pendiente', 'sin_permiso', 'error'].includes(existing.estado) && ultimo.id !== existing.last_msg_id) {
              const contexto = entrantes.map(r => `@${r.username}: ${r.text}`).join('\n').slice(0, 600);
              if (existing.edited) {
                db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, actualizado = 1, note = 'La persona escribió de nuevo en el hilo: revisá tu respuesta.', updated_at = datetime('now') WHERE id = ?`)
                  .run(ultimo.id, String(ultimo.text).slice(0, 500), existing.id);
              } else {
                const prep = await prepararBorrador(d, uid, { ...argsBase, username: c.username, text: contexto, postCaption: m.caption || '' });
                db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, draft = ?, falta_dato = ?, actualizado = 1, estado = 'pendiente', updated_at = datetime('now') WHERE id = ?`)
                  .run(ultimo.id, String(ultimo.text).slice(0, 500), prep.draft, prep.faltaDato, existing.id);
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
          db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato)
            VALUES (?,?, 'comment', ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
            .run(tanda.id, uid, c.id, c.id, ultimo.id, c.username, String(c.text).slice(0, 500), prep.draft, clase, prep.faltaDato);
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
              db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, author_id = ?, actualizado = 1, note = 'La persona escribió de nuevo: revisá tu respuesta.', updated_at = datetime('now') WHERE id = ?`)
                .run(last.id, String(last.text).slice(0, 500), String(last.fromId || ''), existing.id);
            } else {
              const prep = await prepararBorrador(d, uid, { ...argsBase, username, text: contexto });
              db.prepare(`UPDATE bandeja_items SET last_msg_id = ?, text = ?, author_id = ?, draft = ?, falta_dato = ?, actualizado = 1, estado = 'pendiente', updated_at = datetime('now') WHERE id = ?`)
                .run(last.id, String(last.text).slice(0, 500), String(last.fromId || ''), prep.draft, prep.faltaDato, existing.id);
            }
            out.repreparados++; touchTanda(db, tanda.id);
          }
          continue;
        }
        const clase = clasificar(last.text);
        if (clase === 'spam') {
          // En DMs el spam no se oculta en silencio (doctrina de la casa):
          // entra sin borrador, marcado, y lo decide el dueño.
          db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, note)
            VALUES (?,?, 'dm', ?, ?, ?, ?, ?, ?, '', 'spam', 'pendiente', 'Posible spam: sin borrador preparado.')`)
            .run(tanda.id, uid, cv.id, last.id, last.id, username, String(last.fromId || ''), String(last.text).slice(0, 500));
          out.nuevos++; touchTanda(db, tanda.id);
          continue;
        }
        const prep = await prepararBorrador(d, uid, { ...argsBase, username, text: last.text });
        db.prepare(`INSERT OR IGNORE INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, author_id, text, draft, clase, estado, falta_dato)
          VALUES (?,?, 'dm', ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`)
          .run(tanda.id, uid, cv.id, last.id, last.id, username, String(last.fromId || ''), String(last.text).slice(0, 500), prep.draft, clase, prep.faltaDato);
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
  const items = db.prepare(`SELECT * FROM bandeja_items WHERE tanda_id = ? AND estado != 'oculto'
    ORDER BY (clase = 'importante') DESC,
             (estado IN ('pendiente','sin_permiso','error')) DESC,
             created_at ASC, id ASC`).all(tanda.id);
  const pend = items.filter(i => ['pendiente', 'sin_permiso', 'error'].includes(i.estado));
  return {
    ...tanda,
    items,
    conteo: {
      para_salir: pend.filter(i => String(i.draft || '').trim()).length,
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

function countAcciones(db, uid) {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM bandeja_items WHERE user_id = ? AND estado IN ('pendiente','sin_permiso','error')`).get(uid);
  return Number(r.n || 0);
}

// NOVEDADES con datos reales de hoy: el posteo publicado y el impulso
// corriendo (las dos fuentes que existen en la base; nada inventado).
function novedades(db, uid) {
  const out = [];
  try {
    const post = db.prepare(`SELECT caption, published_at FROM posts WHERE user_id = ? AND status = 'published'
      AND published_at IS NOT NULL AND date(published_at) = date('now') ORDER BY published_at DESC LIMIT 1`).get(uid);
    if (post) out.push({ tipo: 'posteo', titulo: 'Tu posteo de hoy salió', detalle: String(post.caption || '').slice(0, 80), cuando: post.published_at });
  } catch (e) {}
  try {
    const boost = db.prepare(`SELECT budget_cents, currency, duration_days, created_at FROM ad_boosts
      WHERE user_id = ? AND status IN ('active','pending') ORDER BY created_at DESC LIMIT 1`).get(uid);
    if (boost) {
      const monto = boost.currency === 'USD' ? 'US$' + Math.round((boost.budget_cents || 0) / 100) : '$' + Math.round((boost.budget_cents || 0) / 100);
      out.push({ tipo: 'impulso', titulo: 'Tu impulso está corriendo', detalle: `${monto} · ${boost.duration_days || 7} días`, cuando: boost.created_at });
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
  const r = db.prepare(`UPDATE bandeja_items SET estado = 'descartado', updated_at = datetime('now')
    WHERE id = ? AND user_id = ? AND estado IN ('pendiente','sin_permiso','error')`).run(itemId, uid);
  return { ok: Number(r.changes) > 0 };
}

function undismissItem(db, uid, itemId) {
  const r = db.prepare(`UPDATE bandeja_items SET estado = 'pendiente', updated_at = datetime('now')
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
  const out = { enviadas: 0, ya_respondidas: 0, sin_permiso: 0, esperando_dato: 0, errores: 0, permiso: true };

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
      db.prepare(`UPDATE bandeja_items SET estado = 'sin_permiso', note = 'Falta el permiso de Instagram para enviar: quedó guardada, no salió.', updated_at = datetime('now') WHERE id = ?`).run(it.id);
      out.sin_permiso++; continue;
    }
    if (respondidos.has(it.thread_key) || (tanda.kind === 'dm' && convNegocioUltimo)) {
      db.prepare(`UPDATE bandeja_items SET estado = 'ya_respondido', decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(it.id);
      out.ya_respondidas++; continue;
    }
    try {
      if (it.source === 'dm') await F.sendDm(creds, it.author_id, it.draft);
      else await F.sendCommentReply(creds, it.comment_id, it.draft);
      db.prepare(`UPDATE bandeja_items SET estado = 'enviado', decided_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(it.id);
      out.enviadas++;
    } catch (e) {
      if (esErrorPermiso(e.message)) {
        cortoPorPermiso = true; out.permiso = false;
        db.prepare(`UPDATE bandeja_items SET estado = 'sin_permiso', note = 'Falta el permiso de Instagram para enviar: quedó guardada, no salió.', updated_at = datetime('now') WHERE id = ?`).run(it.id);
        out.sin_permiso++;
      } else {
        db.prepare(`UPDATE bandeja_items SET estado = 'error', note = ?, updated_at = datetime('now') WHERE id = ?`).run(String(e.message || 'error de envío').slice(0, 160), it.id);
        out.errores++;
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
};
