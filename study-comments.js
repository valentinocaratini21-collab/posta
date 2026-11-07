// study-comments.js — ESTUDIO-PROFUNDO M1 · COMENTARIOS (lote 7/11, base v760).
//
// Lee los comentarios de los posteos recientes del cliente y extrae, de
// forma DETERMINÍSTICA y con procedencia (id del posteo):
//   - faqs: preguntas repetidas de los clientes (misma regla de la casa
//     que preguntas-posteos.js: >= 3 veces Y >= 2 autores distintos.
//     1 vez = anécdota: NO se promueve a FAQ. Nunca se inventa una
//     pregunta que nadie hizo).
//   - hooks: elogios en palabras EXACTAS de los clientes (problema
//     primero: la generación los usa tal cual para los ganchos).
//   - complaints: quejas, con texto verbatim y procedencia.
//   - cero comentarios → rama honesta { note: 'sin_comentarios' }.
// El resultado vive en su propio espacio de nombres (fundamento.comments)
// y NO reescribe el fundamento existente.
//
// CÓMO SE OBTIENEN LOS COMENTARIOS (sin flujo de credenciales nuevo):
// el mismo camino/cliente que ya usa el servidor — ig-comments.js
// (Graph API de Instagram, GET /{ig-user}/media + /{media}/comments,
// con el token OAuth de la cuenta conectada, que ya tiene el permiso
// manage_comments). studyForAccount() lo reutiliza vía fetchCommentsBundle.
// La prueba invitada NO tiene token (el visitante solo da su @ y el embed
// público trae conteos, nunca el texto de los comentarios): studyForTrial()
// devuelve la rama honesta { available:false, reason:'no_ig_connected' }
// sin intentar ningún fetch ni inventar nada. Cuando la cuenta conecta su
// IG, el endpoint /api/ig/mine-comments corre esta misma extracción sobre
// el bundle ya leído (cero fetches extra) y la guarda en fundamento.comments.
//
// Puro salvo el fetch: extractFromBundle y commentsGoalLines no tocan red
// ni DB y nunca lanzan.
//
// Exporta: { extractFromBundle, studyForAccount, studyForTrial,
//   commentsGoalLines, MAX_FAQS, MAX_HOOKS, MAX_COMPLAINTS }
'use strict';

const pp = require('./preguntas-posteos');
const igComments = require('./ig-comments');

const MAX_FAQS = 10;
const MAX_HOOKS = 10;
const MAX_COMPLAINTS = 10;
const MAX_TEXT = 200;

// Elogio: palabras de aprecio en rioplatense + ES neutro. Lista cerrada
// y conservadora: un comentario fuera de la lista NO es gancho (mejor
// perder un elogio que inventar uno).
const PRAISE_RE = /\b(gracias|hermoso|hermosa|hermosisimo|hermosisima|precioso|preciosa|me encanta|me encantan|amo|aman|lo amo|los amo|la amo|las amo|que lindo|qué lindo|que hermoso|qué hermoso|que rico|qué rico|que bueno|qué bueno|que genial|qué genial|que divino|qué divino|felicitaciones|felicidades|genio|genia|increible|increíble|perfecto|perfecta|divino|divina|belleza|recomiendo|recomendado|recomendada|lo mejor|los mejores|fan|una bomba|espectacular|maravilla|una joya)\b/i;
// Emoji de aprecio cuando el comentario NO tiene letras (solo emojis).
const PRAISE_EMOJI_RE = /[😍🥰😘❤️🧡💛💚💙💜🤍🔥👏🙌✨💯]/u;
// Queja: frenos o reclamos legibles en el texto. Lista cerrada y
// conservadora: sin match, el comentario NO es queja.
const COMPLAINT_RE = /\b(no me lleg|nunca me|no lleg[oó]|no vino|no vinieron|caro|cara\b|carisimo|carísimo|demora|demoran|tardan|tardaron|tard[oó] much|mal\b|p[eé]simo|horrible|decepcion|decepci[oó]n|reclamo|estafa|no atienden|no responden|no contestan|falta|roto|rota|vencido|vencida|error|problema|molesto|molesta|enojado|enojada|queja|devuelvan|devuelveme|reembolso|perd[ií] mi|perd[ií] el|no cumplieron|incumpl|deficiente)\b/i;

function cleanText(t) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

function isPraise(text) {
  const t = cleanText(text);
  if (!t) return false;
  if (PRAISE_RE.test(t)) return true;
  // Solo emojis de aprecio, sin letras: «😍😍» también es un elogio.
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (!letters && PRAISE_EMOJI_RE.test(t)) return true;
  return false;
}

function isComplaint(text) {
  const t = cleanText(text);
  if (!t) return false;
  return COMPLAINT_RE.test(t);
}

// Referencia estable del posteo para la procedencia: el id de media de
// IG cuando existe, si no el shortcode. Nunca se inventa un id.
function postRef(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.post_id || item.id || item.shortcode || '').trim();
}

function emptyResult(available, reason, note) {
  return {
    available: !!available,
    reason: reason || '',
    note: note || '',
    faqs: [],
    hooks: [],
    complaints: [],
    counts: { posts: 0, comments: 0, questions_total: 0 },
    analyzed_at: new Date().toISOString(),
  };
}

// extractFromBundle(bundle) → estudio de comentarios.
// bundle: { posts, comments, items: [{ post_id|id|shortcode, comments:
//   [{ username, text }] }] } — la forma que devuelve
//   ig-comments.fetchCommentsBundle.
// Nunca lanza: entrada rota → { available:false, reason:'sin_datos' }.
function extractFromBundle(bundle) {
  try {
    if (!bundle || typeof bundle !== 'object' || !Array.isArray(bundle.items)) {
      return emptyResult(false, 'sin_datos', 'sin_datos');
    }
    const items = bundle.items;
    // Aplanado con procedencia: cada comentario lleva su posteo.
    const flat = [];
    for (const it of items) {
      const ref = postRef(it);
      const list = (it && Array.isArray(it.comments)) ? it.comments : [];
      for (const c of list) {
        if (!c || typeof c !== 'object') continue;
        const text = cleanText(c.text);
        if (!text) continue;
        flat.push({ username: String(c.username || '').trim(), text, post_id: ref });
      }
    }
    const questionsTotal = flat.filter((c) => pp.isQuestion(c.text)).length;
    const counts = {
      posts: items.length,
      comments: flat.length,
      questions_total: questionsTotal,
    };
    if (!flat.length) {
      const out = emptyResult(true, '', 'sin_comentarios');
      out.counts = counts;
      return out;
    }
    // --- FAQs: la agrupación de la casa (preguntas-posteos.js) ---
    // >= 3 veces Y >= 2 autores. La procedencia (post_ids) se reconstruye
    // acá por clave normalizada: groupQuestions no la lleva.
    const groups = pp.groupQuestions(flat);
    const faqs = groups.slice(0, MAX_FAQS).map((g) => {
      const postIds = [];
      for (const c of flat) {
        if (pp.isQuestion(c.text) && pp.normalizeQuestion(c.text) === g.clave) {
          if (c.post_id && !postIds.includes(c.post_id)) postIds.push(c.post_id);
        }
      }
      return {
        pregunta: String(g.pregunta || '').slice(0, MAX_TEXT),
        clave: g.clave,
        veces: g.veces,
        autores: Array.isArray(g.autores) ? g.autores : [],
        ejemplos: (Array.isArray(g.ejemplos) ? g.ejemplos : []).map((e) => String(e).slice(0, MAX_TEXT)),
        post_ids: postIds,
      };
    });
    // --- Ganchos: elogios verbatim, en orden de aparición ---
    const hooks = [];
    for (const c of flat) {
      if (hooks.length >= MAX_HOOKS) break;
      if (pp.isQuestion(c.text)) continue; // una pregunta no es un elogio
      if (isPraise(c.text)) {
        hooks.push({ texto: c.text.slice(0, MAX_TEXT), autor: c.username || '', post_id: c.post_id });
      }
    }
    // --- Quejas: verbatim, en orden de aparición ---
    const complaints = [];
    for (const c of flat) {
      if (complaints.length >= MAX_COMPLAINTS) break;
      if (pp.isQuestion(c.text)) continue;
      if (isComplaint(c.text)) {
        complaints.push({ texto: c.text.slice(0, MAX_TEXT), autor: c.username || '', post_id: c.post_id });
      }
    }
    return {
      available: true,
      reason: '',
      note: (!faqs.length && !hooks.length && !complaints.length) ? 'sin_senal' : 'ok',
      faqs,
      hooks,
      complaints,
      counts,
      analyzed_at: new Date().toISOString(),
    };
  } catch (e) {
    return emptyResult(false, 'sin_datos', 'sin_datos');
  }
}

// studyForAccount({ igUserId, accessToken, fetchBundle? }) → estudio.
// Sin token: rama honesta, SIN intentar ningún fetch (la prueba invitada
// no tiene OAuth). Con token: lee vía ig-comments.fetchCommentsBundle —
// el mismo cliente Graph API del servidor — y extrae. Nunca lanza.
async function studyForAccount({ igUserId, accessToken, fetchBundle } = {}) {
  try {
    if (!igUserId || !accessToken) return emptyResult(false, 'no_ig_connected', 'no_ig_connected');
    const get = (typeof fetchBundle === 'function') ? fetchBundle : igComments.fetchCommentsBundle;
    const bundle = await get(String(igUserId), String(accessToken));
    return extractFromBundle(bundle);
  } catch (e) {
    return emptyResult(false, 'sin_datos', 'sin_datos');
  }
}

// studyForTrial() → la prueba invitada: el visitante solo da su @ y no
// hay token OAuth (el embed público trae conteos, nunca el texto de los
// comentarios). Rama honesta: sin comentarios leídos, nada inventado.
function studyForTrial() {
  return emptyResult(false, 'no_ig_connected', 'no_ig_connected');
}

// commentsGoalLines(comments, lang) → líneas para el goal de generación.
// La generación usa las palabras EXACTAS de los clientes para los
// ganchos (problema primero) y las FAQs reales. Sin datos → []: nunca
// se inventa una línea.
function commentsGoalLines(comments, lang) {
  try {
    const c = (comments && typeof comments === 'object') ? comments : null;
    if (!c || !c.available) return [];
    const en = lang === 'en';
    const lines = [];
    for (const f of (Array.isArray(c.faqs) ? c.faqs : []).slice(0, 3)) {
      const q = String((f && f.pregunta) || '').trim();
      if (!q) continue;
      lines.push(en
        ? `Your customers keep asking (×${f.veces || 2}): «${q}» — answer it in a post, with their words.`
        : `Tus clientes preguntan una y otra vez (×${f.veces || 2}): «${q}» — respondela en un posteo, con sus palabras.`);
    }
    for (const h of (Array.isArray(c.hooks) ? c.hooks : []).slice(0, 3)) {
      const t = String((h && h.texto) || '').trim();
      if (!t) continue;
      lines.push(en
        ? `Your customers say, in their exact words: «${t}» — use their words for hooks.`
        : `Tus clientes dicen, en sus palabras: «${t}» — usá sus palabras para los ganchos.`);
    }
    for (const q of (Array.isArray(c.complaints) ? c.complaints : []).slice(0, 2)) {
      const t = String((q && q.texto) || '').trim();
      if (!t) continue;
      lines.push(en
        ? `Customer complaint to address, not ignore: «${t}»`
        : `Queja de un cliente para atender, no ignorar: «${t}»`);
    }
    return lines;
  } catch (e) { return []; }
}

module.exports = {
  MAX_FAQS, MAX_HOOKS, MAX_COMPLAINTS,
  extractFromBundle, studyForAccount, studyForTrial, commentsGoalLines,
};
