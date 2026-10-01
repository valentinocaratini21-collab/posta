// community.js — Posty responde comentarios y DMs (CON aprobación humana).
//
// Flujo: el scheduler (pollCommunity) lee comentarios recientes de los posteos
// del cliente, clasifica cada uno y redacta una respuesta con la VOZ del
// negocio (client-brief.js + caption-style.js). La respuesta queda en una cola
// de aprobación: NUNCA se envía sola. El cliente aprueba (o descarta) desde
// la UI → recién ahí se publica la respuesta en Instagram.
//
// Estados: pending (lista para aprobar) | needs_human (queja/sensible: Posty
// no se anima, la tiene que ver un humano) | approved | sent | dismissed.
//
// Anti-spam: UNIQUE(user_id, comment_id) + no se responde dos veces al mismo
// usuario en el mismo post. Trolls evidentes → dismissed automático.
//
// DMs: mismo flujo (leer + proponer, nunca auto-enviar). La lectura de DMs
// requiere el permiso instagram_manage_messages: si no está, se informa con
// claridad (no silencioso).
//
// Exporta: { initCommunityTables, classifyComment, fetchPostComments,
//   draftReplyText, queueReplies, approveAndSend, dismissReply,
//   getPendingReplies, pollCommunity, fetchDmThreads, sendIgReply }
'use strict';

const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';
const IG_TIMEOUT_MS = 15000;
const MAX_POSTS_SCAN = 5;     // últimos posteos a revisar por corrida
const MAX_COMMENTS = 25;      // comentarios por posteo
const SLEEP_MS = 400;         // cortesía con la API

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
function initCommunityTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS comment_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'comment',
    post_ig_id TEXT DEFAULT '',
    comment_id TEXT NOT NULL DEFAULT '',
    comment_username TEXT DEFAULT '',
    comment_text TEXT DEFAULT '',
    proposed_reply TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT DEFAULT '',
    UNIQUE(user_id, comment_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_replies_pending ON comment_replies(user_id, status)`);
}

// ---------------------------------------------------------------------------
// classifyComment(text) → 'ok' | 'needs_human' | 'troll'  (puro, sin IA)
// ---------------------------------------------------------------------------
const NEEDS_HUMAN_RE = /(reclamo|estafa|estafaron|denuncia|abogado|defensa del consumidor|p[eé]simo|horrible|nunca m[aá]s|no recomiendo|me cobraron|me mintieron|devoluci[oó]n|reembolso|queja|asco|verg[uü]enza|ladrones|chanta)/i;
const TROLL_RE = /(http[s]?:\/\/|www\.|pelotudo|idiota|mog[oó]lico|forro|put[oa]|mierda|tonto|callate|gan[aá] dinero|cripto|seguidores gratis|onlyfans)/i;

function classifyComment(text) {
  const t = String(text || '');
  if (NEEDS_HUMAN_RE.test(t)) return 'needs_human';
  if (TROLL_RE.test(t)) return 'troll';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Lectura de comentarios (solo lee, nunca escribe)
// ---------------------------------------------------------------------------
async function igGet(path, params, accessToken) {
  const qs = new URLSearchParams(params || {});
  qs.set('access_token', accessToken);
  const res = await fetch(`${IG_HOST}/${API_VERSION}${path}?${qs}`, {
    signal: AbortSignal.timeout(IG_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('ig_' + res.status);
  return res.json();
}

async function fetchPostComments(igUserId, accessToken, opts) {
  const o = opts || {};
  const maxPosts = o.maxPosts || MAX_POSTS_SCAN;
  const maxComments = o.maxComments || MAX_COMMENTS;
  const media = await igGet(`/${igUserId}/media`,
    { fields: 'id,caption,timestamp', limit: String(maxPosts) }, accessToken);
  const items = (media && Array.isArray(media.data)) ? media.data : [];
  const out = [];
  for (const m of items) {
    let comments = [];
    try {
      const c = await igGet(`/${m.id}/comments`,
        { fields: 'id,text,username,timestamp', limit: String(maxComments) }, accessToken);
      comments = ((c && Array.isArray(c.data)) ? c.data : [])
        .map(r => ({
          id: String(r.id || ''),
          username: String(r.username || ''),
          text: String(r.text || '').trim(),
          timestamp: String(r.timestamp || ''),
        }))
        .filter(r => r.id && r.text);
    } catch (e) { comments = []; }
    out.push({ mediaId: String(m.id), caption: String(m.caption || '').slice(0, 200), comments });
    await new Promise(r => setTimeout(r, SLEEP_MS));
  }
  return out;
}

// ---------------------------------------------------------------------------
// DMs (best-effort: requiere instagram_manage_messages)
// ---------------------------------------------------------------------------
async function fetchDmThreads(igUserId, accessToken) {
  try {
    const data = await igGet(`/${igUserId}/conversations`, { platform: 'instagram', limit: '10' }, accessToken);
    const items = (data && Array.isArray(data.data)) ? data.data : [];
    return { ok: true, threads: items.length, items };
  } catch (e) {
    return { ok: false, reason: 'Los mensajes directos necesitan un permiso extra de Instagram (instagram_manage_messages). Por ahora Posty solo gestiona comentarios.' };
  }
}

// ---------------------------------------------------------------------------
// Redacción con la voz del negocio.
// aiFn({system, user}) → Promise<string> — inyectada (tests) o OpenAI.
// ---------------------------------------------------------------------------
async function defaultAiFn({ system, user }, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 120,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error('openai_' + res.status);
  const data = await res.json();
  return String((data.choices && data.choices[0] && data.choices[0].message.content) || '').trim();
}

function replySystemPrompt(briefBlock, styleBlock, business) {
  return (
    'Sos Posty, el community manager de ' + business + '. Respondés UN comentario de Instagram como lo haría el dueño del negocio: cálido, útil, humano, en español rioplatense.\n' +
    (briefBlock ? 'DATO DEL NEGOCIO:\n' + briefBlock + '\n' : '') +
    (styleBlock ? 'CÓMO ESCRIBE EL CLIENTE:\n' + styleBlock + '\n' : '') +
    'REGLAS DURAS:\n' +
    '- Máx 280 caracteres. Sin asteriscos ni formato raro: un humano no usa eso.\n' +
    '- Si preguntan precio/horario/ubicación y el dato está en el brief, responderlo. Si NO está, decir "te lo confirmo por privado" (nunca inventar).\n' +
    '- Nunca prometer descuentos ni stock que no conozcas. Nunca discutir.\n' +
    '- Respondé SOLO el texto de la respuesta, sin comillas ni explicaciones.'
  );
}

async function draftReplyText({ comment, business, briefBlock, styleBlock, apiKey, aiFn }) {
  const text = String((comment && comment.text) || '').trim();
  if (!text) return { error: 'comentario vacío' };
  const system = replySystemPrompt(briefBlock || '', styleBlock || '', business || 'el negocio');
  const user = `Comentario de @${comment.username || 'alguien'}: "${text.slice(0, 300)}"`;
  try {
    const fn = aiFn || ((p) => defaultAiFn(p, apiKey));
    if (!aiFn && !apiKey) return { error: 'sin clave de IA' };
    const reply = String(await fn({ system, user })).trim().replace(/^["'«»]+|["'«»]+$/g, '');
    if (!reply) return { error: 'la IA no devolvió texto' };
    return { reply: reply.slice(0, 280) };
  } catch (e) {
    return { error: e.message || 'falló la IA' };
  }
}

// ---------------------------------------------------------------------------
// Cola de aprobación
// ---------------------------------------------------------------------------
function queueReplies(db, uid, items) {
  // items: [{ source, postIgId, commentId, username, text, proposedReply, status, note }]
  let queued = 0, dupes = 0;
  const ins = db.prepare(
    `INSERT OR IGNORE INTO comment_replies
     (user_id, source, post_ig_id, comment_id, comment_username, comment_text, proposed_reply, status, note)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const it of items) {
    try {
      // Anti-spam: no responder 2 veces al mismo usuario en el mismo post
      const prior = db.prepare(
        `SELECT id FROM comment_replies WHERE user_id = ? AND post_ig_id = ? AND comment_username = ?
         AND status IN ('pending','approved','sent') LIMIT 1`).get(uid, it.postIgId || '', it.username || '');
      if (prior) { dupes++; continue; }
      const r = ins.run(uid, it.source || 'comment', it.postIgId || '', it.commentId || '',
        it.username || '', String(it.text || '').slice(0, 500),
        String(it.proposedReply || '').slice(0, 500), it.status || 'pending', it.note || '');
      if (Number(r.changes) > 0) queued++; else dupes++;
    } catch (e) { dupes++; }
  }
  return { queued, dupes };
}

function getPendingReplies(db, uid, limit) {
  return db.prepare(
    `SELECT * FROM comment_replies WHERE user_id = ? AND status IN ('pending','needs_human')
     ORDER BY created_at DESC LIMIT ?`).all(uid, limit || 50);
}

// ---------------------------------------------------------------------------
// Envío real a Instagram (solo se llama desde approveAndSend: aprobación humana)
// ---------------------------------------------------------------------------
async function sendIgReply({ commentId, message }, { igUserId, accessToken }) {
  if (!commentId || !message) throw new Error('faltan datos para responder');
  const res = await fetch(`${IG_HOST}/${API_VERSION}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(message).slice(0, 1000), access_token: accessToken }),
    signal: AbortSignal.timeout(IG_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('ig_' + res.status));
  return { ok: true, id: String(data.id || '') };
}

async function approveAndSend(db, replyId, uid, deps) {
  const { creds, sendFn } = deps || {};
  const row = db.prepare('SELECT * FROM comment_replies WHERE id = ? AND user_id = ?').get(replyId, uid);
  if (!row) throw new Error('respuesta no encontrada');
  if (!['pending', 'needs_human'].includes(row.status)) throw new Error('esta respuesta ya fue procesada');
  if (row.source === 'dm') throw new Error('los DMs se responden desde Instagram por ahora');
  const fn = sendFn || sendIgReply;
  const r = await fn({ commentId: row.comment_id, message: row.proposed_reply }, creds);
  db.prepare(`UPDATE comment_replies SET status = 'sent', decided_at = datetime('now') WHERE id = ?`).run(replyId);
  return { ok: true, igId: r.id };
}

function dismissReply(db, replyId, uid) {
  const r = db.prepare(
    `UPDATE comment_replies SET status = 'dismissed', decided_at = datetime('now')
     WHERE id = ? AND user_id = ? AND status IN ('pending','needs_human')`).run(replyId, uid);
  return { ok: Number(r.changes) > 0 };
}

// ---------------------------------------------------------------------------
// pollCommunity(db, deps) — entrada del scheduler (2 veces/día).
// deps: { getBriefBlock(uid), getStyleBlock(uid), getBusiness(uid), getApiKey(uid), fetchFn }
// Nunca lanza: un usuario fallido no rompe el resto.
// ---------------------------------------------------------------------------
async function pollCommunity(db, deps) {
  const out = { users: 0, queued: 0, needsHuman: 0, errors: [] };
  const d = deps || {};
  let users = [];
  try {
    users = db.prepare(
      `SELECT u.id, s.ig_user_id, s.ig_access_token FROM users u
       JOIN settings s ON s.user_id = u.id
       WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
         AND s.ig_access_token IS NOT NULL AND s.ig_access_token != ''
       LIMIT 10`).all();
  } catch (e) { out.errors.push('users: ' + e.message); return out; }
  const fetchPosts = d.fetchFn || fetchPostComments;
  for (const u of users) {
    try {
      out.users++;
      const posts = await fetchPosts(u.ig_user_id, u.ig_access_token);
      const briefBlock = d.getBriefBlock ? d.getBriefBlock(u.id) : '';
      const styleBlock = d.getStyleBlock ? d.getStyleBlock(u.id) : '';
      const business = d.getBusiness ? d.getBusiness(u.id) : 'el negocio';
      const apiKey = d.getApiKey ? d.getApiKey(u.id) : '';
      const items = [];
      for (const p of posts) {
        for (const c of (p.comments || [])) {
          const cls = classifyComment(c.text);
          if (cls === 'troll') continue; // trolls: silencio, no se encolan
          if (cls === 'needs_human') {
            items.push({ source: 'comment', postIgId: p.mediaId, commentId: c.id, username: c.username, text: c.text, proposedReply: '', status: 'needs_human', note: 'Posible queja o tema sensible: revisar antes de responder.' });
            out.needsHuman++;
            continue;
          }
          const dr = await draftReplyText({ comment: c, business, briefBlock, styleBlock, apiKey, aiFn: d.aiFn });
          if (dr.reply) items.push({ source: 'comment', postIgId: p.mediaId, commentId: c.id, username: c.username, text: c.text, proposedReply: dr.reply, status: 'pending', note: '' });
          else items.push({ source: 'comment', postIgId: p.mediaId, commentId: c.id, username: c.username, text: c.text, proposedReply: '', status: 'needs_human', note: 'No se pudo redactar: ' + (dr.error || 'sin IA') });
          await new Promise(r => setTimeout(r, 200));
        }
      }
      const q = queueReplies(db, u.id, items);
      out.queued += q.queued;
    } catch (e) {
      out.errors.push(`uid ${u.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500)); // cortesía entre usuarios
  }
  return out;
}

module.exports = {
  initCommunityTables, classifyComment, fetchPostComments, fetchDmThreads,
  draftReplyText, queueReplies, getPendingReplies, approveAndSend, dismissReply,
  sendIgReply, pollCommunity,
};
