'use strict';
/* =====================================================================
 * study-ranking.js — ESTUDIO-PROFUNDO MEJORA 2 · RANKEO PROPIO
 * (aprobado Valentino 7/11 ~16:00 «Perfecto! Arma todo»).
 *
 * Para cada uno de los últimos 12 posteos del cliente, tasa de respuesta
 * contra el promedio PROPIO del cliente; top 3 con el POR QUÉ (formato,
 * gancho, tema, hora). Extiende la garantía #6 de rubro-garantias.js
 * (rubro según su propio feed, procedencia «tu feed»): los temas del
 * top 3 refuerzan productos en el fundamento. NO reconstruye «mejores
 * posteos» (best_posts por likes absolutos sigue en feed-audit.js): el
 * rankeo es RELATIVO al propio promedio, así que un posteo con muchos
 * likes pero poca respuesta total no gana por número absoluto.
 *
 * FÓRMULA EXACTA:
 *   tasa_respuesta(post) = (likes + comentarios) / seguidores
 *   promedio_propio      = media de tasa_respuesta sobre los posteos
 *                          medibles de los últimos 12
 *   vs_promedio(post)    = tasa_respuesta(post) / promedio_propio
 *   top 3                = mayor vs_promedio (desempate: más respuesta
 *                          absoluta, luego más reciente)
 * Un posteo es medible solo si likes Y comentarios son números finitos;
 * si falta uno, queda fuera del promedio y se marca (nunca se inventa).
 * Sin seguidores (null/0/no finito) no hay tasa: calculable=false y la
 * nota lo documenta. Si el promedio propio es 0 (nadie respondió a
 * nada), no hay top 3 que reforzar: top3=[] con nota que lo documenta.
 * La hora es la de publicación en UTC-3 (AR/UY, mismo criterio que
 * trialAuditFromData en feed-audit.js). El gancho se lee solo de la
 * apertura del caption (primera frase), con el mismo criterio de
 * pregunta/llamado que TRIAL_HOOK_RE. El tema sale del caption real:
 * primer hashtag, o las primeras palabras distintivas; tema_palabras
 * usa distinctiveWords de fundamento-literal, el mismo vocabulario con
 * el que rubro-garantias.js calza productos (así el refuerzo calza).
 * Todo puro y determinista, USD 0. NUNCA lanza.
 * ===================================================================== */
const fl = require('./fundamento-literal');
const distinctiveWords = fl.distinctiveWords;

const MAX_POSTS = 12;

// Apertura con gancho: pregunta o llamado en la primera frase (espejo
// de TRIAL_HOOK_RE en feed-audit.js, mismo criterio, sin duplicar la
// lista entera: acá basta pregunta/interpelación directa).
const HOOK_OPEN_RE = /^[¿¡]/;
const HOOK_WORD_RE = /^(probá|proba|mirá|mira|vení|veni|escrib|reserv|pedí|pedi|comentá|comenta|guardá|guarda|descubr|conocé|conoce|hacé|hace|sumate|anotá|anota|agendá|agenda|empezá|empeza|aprovech|book|save|comment|tag|order|try|discover|join|tap|share|shop now|check out)/i;

function numFinito(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
}
function round(v, dec) {
  const f = Math.pow(10, dec);
  return Math.round(v * f) / f;
}
function formatoDe(type) {
  if (type === 'GraphVideo') return 'video';
  if (type === 'GraphSidecar') return 'carrusel';
  if (type === 'GraphImage') return 'imagen';
  return 'posteo';
}
// Hora de publicación en UTC-3 (AR/UY) + franja del día.
function horaYFranja(takenAt) {
  const ts = numFinito(takenAt);
  if (ts == null || ts <= 0) return { hora: null, franja: null };
  const h = new Date((ts - 3 * 3600) * 1000).getUTCHours();
  const franja = h < 6 ? 'madrugada' : h < 12 ? 'mañana' : h < 19 ? 'tarde' : 'noche';
  return { hora: h, franja };
}
function ganchoDe(caption) {
  const cap = String(caption || '').trim();
  if (!cap) return { gancho: '', gancho_es_pregunta: false };
  const apertura = (cap.split(/(?<=[.!?…])\s+/)[0] || cap).slice(0, 80).trim();
  const esPregunta = HOOK_OPEN_RE.test(apertura) || apertura.includes('?') || HOOK_WORD_RE.test(apertura);
  return { gancho: apertura, gancho_es_pregunta: esPregunta };
}
function temaDe(caption) {
  const cap = String(caption || '').trim();
  const tags = (cap.match(/#[\p{L}0-9_]+/gu) || []).map((t) => t.slice(1).toLowerCase()).filter(Boolean);
  const palabras = distinctiveWords(cap).slice(0, 6);
  const tema = tags[0] || palabras.slice(0, 3).join(' ') || '';
  return { tema, tema_palabras: palabras, tema_hashtags: tags.slice(0, 3) };
}

function rankOwnPosts(posts, followers, opts) {
  const lang = (opts && opts.lang === 'en') ? 'en' : 'es';
  const T = (es, enS) => (lang === 'en' ? enS : es);
  try {
    const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object').slice(0, MAX_POSTS);
    const segs = numFinito(followers);
    const out = {
      calculable: false,
      seguidores: (segs != null && segs > 0) ? segs : null,
      motivo_no_calculable: null,
      n_posts: list.length,
      n_medibles: 0,
      promedio_tasa: null,
      top3: [],
      ranking: [],
      nota: '',
    };
    // Las filas se arman ANTES del gate de seguidores: la medibilidad
    // (likes + comentarios presentes) no depende de los seguidores, así
    // que n_medibles es veraz aunque la tasa no se pueda calcular.
    const rows = list.map((p) => {
      const likes = numFinito(p.likes);
      const comments = numFinito(p.comments);
      const medible = likes != null && comments != null;
      const engagement = medible ? likes + comments : null;
      const tasa = (medible && out.seguidores != null) ? engagement / out.seguidores : null;
      const hf = horaYFranja(p.taken_at);
      const g = ganchoDe(p.caption);
      const t = temaDe(p.caption);
      return {
        shortcode: String(p.shortcode || ''),
        likes,
        comments,
        engagement,
        tasa: tasa == null ? null : round(tasa, 6),
        vs_promedio: null,
        formato: formatoDe(p.type),
        gancho: g.gancho,
        gancho_es_pregunta: g.gancho_es_pregunta,
        tema: t.tema,
        tema_palabras: t.tema_palabras,
        tema_hashtags: t.tema_hashtags,
        hora: hf.hora,
        franja: hf.franja,
        taken_at: numFinito(p.taken_at),
        caption_head: String(p.caption || '').slice(0, 80),
        procedencia: 'tu feed',
        _medible: medible,
      };
    });
    const medibles = rows.filter((r) => r._medible);
    out.n_medibles = medibles.length;
    if (out.seguidores == null) {
      out.motivo_no_calculable = 'sin_seguidores';
      out.nota = T(
        'Sin dato de seguidores: la tasa de respuesta no se puede calcular y no se inventa.',
        'No follower count: the response rate cannot be computed and is never invented.'
      );
      return out;
    }
    if (!medibles.length) {
      out.motivo_no_calculable = 'sin_posteos_medibles';
      out.nota = T(
        'Ningún posteo trae likes y comentarios: la tasa de respuesta no se puede calcular y no se inventa.',
        'No post carries likes and comments: the response rate cannot be computed and is never invented.'
      );
      return out;
    }
    const promedio = medibles.reduce((a, r) => a + r.tasa, 0) / medibles.length;
    out.promedio_tasa = round(promedio, 6);
    out.calculable = true;
    // vs_promedio + orden: tasa desc, respuesta absoluta desc, más reciente.
    const sorted = medibles.slice().sort((a, b) =>
      (b.tasa - a.tasa) || (b.engagement - a.engagement) || ((b.taken_at || 0) - (a.taken_at || 0)));
    for (const r of sorted) {
      r.vs_promedio = promedio > 0 ? round(r.tasa / promedio, 2) : null;
    }
    const pub = (r) => {
      const o = { ...r };
      delete o._medible;
      return o;
    };
    // Los no medibles van al final del ranking, con tasa null (trazables,
    // nunca inventados); el top 3 solo lleva posteos con respuesta > 0.
    const noMedibles = rows.filter((r) => !r._medible).map(pub);
    out.ranking = sorted.map(pub).concat(noMedibles);
    out.top3 = promedio > 0 ? sorted.filter((r) => r.tasa > 0).slice(0, 3).map(pub) : [];
    out.nota = promedio > 0
      ? T(
        'Tasa de respuesta = (likes + comentarios) / seguidores; promedio propio ' + out.promedio_tasa + ' sobre ' + out.n_medibles + ' posteos medibles de los últimos ' + out.n_posts + '.',
        'Response rate = (likes + comments) / followers; own average ' + out.promedio_tasa + ' over ' + out.n_medibles + ' measurable posts of the last ' + out.n_posts + '.'
      )
      : T(
        'Promedio propio 0: ningún posteo registró respuesta; no hay top que reforzar.',
        'Own average 0: no post recorded any response; there is no top to reinforce.'
      );
    return out;
  } catch (_) {
    return {
      calculable: false, seguidores: null, motivo_no_calculable: 'sin_posteos_medibles',
      n_posts: 0, n_medibles: 0, promedio_tasa: null, top3: [], ranking: [],
      nota: lang === 'en' ? 'Ranking could not be computed.' : 'No se pudo calcular el rankeo.',
    };
  }
}

module.exports = { rankOwnPosts, MAX_POSTS };
