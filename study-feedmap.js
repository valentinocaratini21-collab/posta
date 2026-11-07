// study-feedmap.js — MAPA DEL FEED (ESTUDIO-PROFUNDO · mejora 4, 7/11)
//
// Los últimos 9-12 posteos del cliente como una grilla: color dominante
// por posteo, mix de formatos, qué se repite y qué falta (HUECOS: ej. 9
// posteos sin una cara, todo producto, nadie adentro). El mapa se guarda
// en el fundamento con procedencia (fundamento.feedMap) y el plan de la
// semana lo USA para tapar los huecos en vez de repetir lo que ya hay
// (applyFeedMapToPool + líneas de brief para el generador de ideas).
//
// REGLAS DE HONESTIDAD (mismo contrato que el resto del estudio):
// - Todo determinístico, cero IA, cero fetches nuevos: solo se lee lo que
//   el embed de IG ya trajo (tipo, caption, thumb) más los campos
//   explícitos que un llamador aporte (has_face / subject / dominant_hex).
// - La CARA de un posteo solo se afirma con señal explícita (has_face,
//   faces[], people_count). El caption NUNCA afirma una cara: sin señal,
//   has_face queda null ("no observado") y el hueco 'sin_caras' NO se
//   dispara. Un feed sin cobertura de caras no inventa el hueco.
// - El SUJETO ('producto' / 'persona') igual: explícito, o pista de
//   caption solo para 'persona' (léxico de equipo/detrás de escena);
//   sin pista, subject queda null. El hueco 'solo_producto' exige
//   sujetos conocidos en ≥6 posteos, todos producto, y 0 caras.
// - El COLOR dominante por posteo sale de dominant_hex / palette_hexes
//   explícitos o del mapa huesByShortcode que el llamador calculó con
//   la extracción de paleta que ya existe (feed-audit). Sin dato, null.
// - VENTANA: se evalúan huecos solo con 9-12 posteos. Con menos de 9
//   (feed flaco) el mapa se devuelve igual (grilla + mix observados)
//   pero con insufficient:true, gaps:[] y reason 'feed_flaco': nunca se
//   inventa un hueco con una muestra chica.
// - El formato SÍ se observa siempre: viene del __typename del embed
//   (GraphImage/GraphVideo/GraphSidecar), así que 'sin_video' y
//   'sin_carrusel' son huecos observados, no inferidos.
//
// Exporta: { buildFeedMap, feedMapGoalLines, feedMapBriefLines,
//   applyFeedMapToPool, pickFillsGap, feedMapFromDigest, isFeedMap,
//   hueBucketFromHex, hueName, FEEDMAP_VERSION, WINDOW_MIN, WINDOW_MAX,
//   GAP_KEYS, FORMAT_OF_TYPE }
'use strict';

const FEEDMAP_VERSION = 1;
const WINDOW_MIN = 9;
const WINDOW_MAX = 12;

const FORMAT_OF_TYPE = { GraphImage: 'foto', GraphVideo: 'video', GraphSidecar: 'carrusel' };
const GAP_KEYS = ['sin_caras', 'sin_video', 'sin_carrusel', 'solo_producto'];

// Pista de caption para sujeto 'persona': el cliente/equipo aparece en
// escena (detrás de escena, el equipo, la clienta). Léxico estrecho a
// propósito: un caption de producto ("nuestro café") NO dispara persona.
const PERSON_CUES = /\b(nuestro equipo|nuestra equipo|el equipo|conocé al equipo|conoce al equipo|detrás de escena|detras de escena|detrás de cámaras|detras de camaras|backstage|así trabajo|asi trabajo|yo soy|soy la dueña|soy el dueño|nuestra clienta|nuestro cliente|nuestros clientes|gracias por venir|con nosotros)\b/i;

// Palabras que delatan una idea de "gente / detrás de escena" (para que
// el plan de la semana pueda tapar el hueco de caras/personas).
const PEOPLE_WORDS = /(gente|equipo|detr[aá]s de escena|detras de escena|client[ae]|persona|humano|rostro|cara|dueñ[oa]|nosotros|comunidad|testimoni|detr[aá]s de c[aá]mara)/i;

const HUE_NAMES_ES = ['rojo', 'naranja', 'amarillo', 'verde', 'turquesa', 'azul', 'violeta', 'rosa', 'rojo'];
const HUE_NAMES_EN = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink', 'red'];
function hueName(bucket, lang) {
  const b = Number(bucket);
  if (!Number.isFinite(b) || b < 0 || b > 8) return null;
  return (lang === 'en' ? HUE_NAMES_EN : HUE_NAMES_ES)[b] || null;
}

// Misma bucketización que feed-audit.hexToHueBucket (duplicada acá para
// que el módulo sea puro y testeable sin fetches): 9 buckets de 40°;
// grises (delta < 0.12) no cuentan como tono.
function hueBucketFromHex(hex) {
  try {
    if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 0.12) return -1;
    let h = 0;
    const d = mx - mn;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
    return Math.floor(h / 40);
  } catch (_) { return null; }
}

function formatOf(post) {
  if (!post || typeof post !== 'object') return 'otro';
  if (FORMAT_OF_TYPE[post.type]) return FORMAT_OF_TYPE[post.type];
  const t = String(post.formato || post.format || '').toLowerCase();
  if (t === 'video' || t === 'reel') return 'video';
  if (t === 'carrusel' || t === 'carousel') return 'carrusel';
  if (t === 'foto' || t === 'imagen' || t === 'image') return 'foto';
  return 'otro';
}

function faceOf(post) {
  if (!post || typeof post !== 'object') return { value: null, source: 'sin_dato' };
  if (typeof post.has_face === 'boolean') return { value: post.has_face, source: 'explicito' };
  if (Array.isArray(post.faces)) return { value: post.faces.length > 0, source: 'explicito' };
  if (typeof post.people_count === 'number' && Number.isFinite(post.people_count)) {
    return { value: post.people_count > 0, source: 'explicito' };
  }
  return { value: null, source: 'sin_dato' };
}

function subjectOf(post) {
  if (!post || typeof post !== 'object') return { value: null, source: 'sin_dato' };
  const s = String(post.subject || post.sujeto || '').toLowerCase().trim();
  if (s === 'producto' || s === 'persona' || s === 'lugar' || s === 'otro') {
    return { value: s, source: 'explicito' };
  }
  const cap = String(post.caption || '');
  if (cap && PERSON_CUES.test(cap)) return { value: 'persona', source: 'caption' };
  return { value: null, source: 'sin_dato' };
}

function hueOf(post, huesByShortcode) {
  if (post && typeof post === 'object') {
    const b = Number(post.dominant_hue_bucket);
    if (Number.isFinite(b) && b >= 0 && b <= 8) return { bucket: b, source: 'explicito' };
    if (typeof post.dominant_hex === 'string') {
      const hb = hueBucketFromHex(post.dominant_hex);
      if (hb != null && hb >= 0) return { bucket: hb, source: 'explicito' };
    }
    if (Array.isArray(post.palette_hexes)) {
      for (const h of post.palette_hexes) {
        const hb = hueBucketFromHex(h);
        if (hb != null && hb >= 0) return { bucket: hb, source: 'explicito' };
      }
    }
    if (post.shortcode && huesByShortcode && typeof huesByShortcode === 'object') {
      const mb = Number(huesByShortcode[post.shortcode]);
      if (Number.isFinite(mb) && mb >= 0 && mb <= 8) return { bucket: mb, source: 'paleta' };
    }
  }
  return { bucket: null, source: 'sin_dato' };
}

// Qué formato/tema tapa cada hueco. El plan de la semana usa fills para
// elegir (no para inventar): el tema sigue siendo un producto real del
// fundamento; lo que cambia es el FORMATO y el ángulo (gente/reel).
const GAP_FILLS = {
  sin_caras: {
    format: 'foto',
    tema: 'detras_de_escena',
    angulo_es: 'mostrá a la gente detrás del negocio (vos, tu equipo, una clienta) en primer plano',
    angulo_en: 'show the people behind the business (you, your team, a client) front and center',
  },
  sin_video: {
    format: 'video',
    tema: 'reel',
    angulo_es: 'un reel con tu producto real en movimiento',
    angulo_en: 'a reel with your real product in motion',
  },
  sin_carrusel: {
    format: 'carrusel',
    tema: 'carrusel',
    angulo_es: 'un carrusel que cuente el producto en varios pasos',
    angulo_en: 'a carousel that tells the product story in several steps',
  },
  solo_producto: {
    format: 'foto',
    tema: 'detras_de_escena',
    angulo_es: 'una foto con gente adentro: vos o tu equipo con el producto, no el producto solo',
    angulo_en: 'a photo with people in it: you or your team with the product, not the product alone',
  },
};
const GAP_LABELS = {
  sin_caras: { es: 'sin caras', en: 'no faces' },
  sin_video: { es: 'sin video', en: 'no video' },
  sin_carrusel: { es: 'sin carrusel', en: 'no carousel' },
  solo_producto: { es: 'todo producto, nadie adentro', en: 'all product, nobody in it' },
};

// posts: posteos del embed (orden newest-first, como vienen). opts:
// { postsCountTotal, huesByShortcode, at }.
function buildFeedMap(posts, opts = {}) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object');
  const windowPosts = list.slice(0, WINDOW_MAX);
  const n = windowPosts.length;
  const grid = windowPosts.map((p) => {
    const face = faceOf(p);
    const subj = subjectOf(p);
    const hue = hueOf(p, o.huesByShortcode);
    return {
      shortcode: (p.shortcode && String(p.shortcode)) || '',
      format: formatOf(p),
      dominant_hue_bucket: hue.bucket,
      dominant_hue_name: hueName(hue.bucket, 'es'),
      dominant_hue_source: hue.source,
      has_face: face.value,
      face_source: face.source,
      subject: subj.value,
      subject_source: subj.source,
      caption_head: String(p.caption || '').slice(0, 80),
      likes: (typeof p.likes === 'number' && Number.isFinite(p.likes)) ? p.likes : null,
      taken_at: (typeof p.taken_at === 'number' && Number.isFinite(p.taken_at)) ? p.taken_at : null,
    };
  });
  const mix = { fotos: 0, videos: 0, carruseles: 0, otros: 0 };
  grid.forEach((c) => {
    if (c.format === 'foto') mix.fotos++;
    else if (c.format === 'video') mix.videos++;
    else if (c.format === 'carrusel') mix.carruseles++;
    else mix.otros++;
  });
  const mixTotal = Math.max(1, n);
  const mixShares = {
    foto: Math.round((mix.fotos / mixTotal) * 100) / 100,
    video: Math.round((mix.videos / mixTotal) * 100) / 100,
    carrusel: Math.round((mix.carruseles / mixTotal) * 100) / 100,
  };
  const fmtEntries = [['foto', mix.fotos], ['video', mix.videos], ['carrusel', mix.carruseles]];
  fmtEntries.sort((a, b) => b[1] - a[1]);
  const dominantFormat = fmtEntries[0][1] > 0 ? fmtEntries[0][0] : null;
  const hueCounts = {};
  grid.forEach((c) => { if (c.dominant_hue_bucket != null) hueCounts[c.dominant_hue_bucket] = (hueCounts[c.dominant_hue_bucket] || 0) + 1; });
  const dominantHues = Object.keys(hueCounts).map(Number).sort((a, b) => hueCounts[b] - hueCounts[a]);
  const facesObserved = grid.filter((c) => c.has_face != null);
  const faces = {
    observed: facesObserved.length,
    coverage: n ? Math.round((facesObserved.length / n) * 100) / 100 : 0,
    with_face: facesObserved.filter((c) => c.has_face === true).length,
    without_face: facesObserved.filter((c) => c.has_face === false).length,
    unobserved: n - facesObserved.length,
  };
  const knownSubjects = grid.filter((c) => c.subject != null);
  const subjCounts = {};
  knownSubjects.forEach((c) => { subjCounts[c.subject] = (subjCounts[c.subject] || 0) + 1; });
  const topSubject = Object.keys(subjCounts).sort((a, b) => subjCounts[b] - subjCounts[a])[0] || null;
  const repeats = {
    formato_dominante: dominantFormat ? { formato: dominantFormat, count: mix[dominantFormat === 'foto' ? 'fotos' : dominantFormat === 'video' ? 'videos' : 'carruseles'], share: mixShares[dominantFormat] } : null,
    sujeto_top: topSubject ? { sujeto: topSubject, count: subjCounts[topSubject], share: Math.round((subjCounts[topSubject] / Math.max(1, knownSubjects.length)) * 100) / 100, known: knownSubjects.length } : null,
    tono_dominante: dominantHues.length ? { bucket: dominantHues[0], nombre: hueName(dominantHues[0], 'es'), count: hueCounts[dominantHues[0]], share: Math.round((hueCounts[dominantHues[0]] / Math.max(1, grid.filter((c) => c.dominant_hue_bucket != null).length)) * 100) / 100 } : null,
  };

  // --- Huecos: solo con ventana completa (9-12). Con feed flaco, nada. ---
  const insufficient = n < WINDOW_MIN;
  const gaps = [];
  if (!insufficient) {
    if (faces.coverage >= 0.8 && faces.with_face === 0) {
      gaps.push({
        key: 'sin_caras',
        label_es: GAP_LABELS.sin_caras.es, label_en: GAP_LABELS.sin_caras.en,
        evidence: `0 de ${faces.observed} posteos observados muestran una cara (cobertura ${faces.observed}/${n})`,
        evidence_source: 'instagram',
        fills: GAP_FILLS.sin_caras,
      });
    }
    if (mix.videos === 0) {
      gaps.push({
        key: 'sin_video',
        label_es: GAP_LABELS.sin_video.es, label_en: GAP_LABELS.sin_video.en,
        evidence: `0 videos en los últimos ${n} posteos`,
        evidence_source: 'instagram',
        fills: GAP_FILLS.sin_video,
      });
    }
    if (mix.carruseles === 0) {
      gaps.push({
        key: 'sin_carrusel',
        label_es: GAP_LABELS.sin_carrusel.es, label_en: GAP_LABELS.sin_carrusel.en,
        evidence: `0 carruseles en los últimos ${n} posteos`,
        evidence_source: 'instagram',
        fills: GAP_FILLS.sin_carrusel,
      });
    }
    if (knownSubjects.length >= 6 && knownSubjects.every((c) => c.subject === 'producto') && faces.with_face === 0 && faces.coverage >= 0.8) {
      gaps.push({
        key: 'solo_producto',
        label_es: GAP_LABELS.solo_producto.es, label_en: GAP_LABELS.solo_producto.en,
        evidence: `${knownSubjects.length}/${knownSubjects.length} posteos clasificados muestran solo producto, 0 con personas`,
        evidence_source: 'instagram',
        fills: GAP_FILLS.solo_producto,
      });
    }
  }
  return {
    version: FEEDMAP_VERSION,
    n_posts: n,
    posts_count_total: (typeof o.postsCountTotal === 'number' && Number.isFinite(o.postsCountTotal)) ? o.postsCountTotal : null,
    insufficient,
    insufficient_reason: insufficient ? 'feed_flaco' : null,
    min_required: WINDOW_MIN,
    grid,
    mix: { ...mix, shares: mixShares },
    dominant_format: dominantFormat,
    dominant_hues: dominantHues,
    faces,
    repeats,
    gaps,
    provenance: { source: 'instagram', at: (typeof o.at === 'number' ? o.at : Date.now()), window: [WINDOW_MIN, WINDOW_MAX] },
  };
}

function isFeedMap(o) {
  return !!(o && typeof o === 'object' && o.version === FEEDMAP_VERSION
    && Array.isArray(o.grid) && Array.isArray(o.gaps) && o.provenance && o.provenance.source === 'instagram');
}

function feedMapFromDigest(digest) {
  try {
    const fm = digest && digest.feedMap;
    return isFeedMap(fm) ? fm : null;
  } catch (_) { return null; }
}

// Líneas para el goal de la semana de la PRUEBA (richGoal): el spec y
// las captions se arman con el hueco presente, no con el formato que
// ya domina el feed.
function feedMapGoalLines(feedMap, lang) {
  const en = lang === 'en';
  if (!isFeedMap(feedMap) || !feedMap.gaps.length) return [];
  return feedMap.gaps.map((g) => {
    const f = g.fills || {};
    return en
      ? `Gap in their feed (${g.label_en}; evidence: ${g.evidence}): this week must cover it — ${f.angulo_en || ''}.`
      : `Hueco en su feed (${g.label_es}; evidencia: ${g.evidence}): esta semana tiene que taparlo — ${f.angulo_es || ''}.`;
  });
}

// Bloque corto para el brief de ideas de la semana de la CUENTA
// (ideasInputFor lo suma al texto sabeSiempre, que el prompt de ideas
// ya interpola tal cual — openaiIdeas desestructura campos fijos, así
// que un campo nuevo se perdería).
function feedMapBriefLines(feedMap, lang) {
  const en = lang === 'en';
  if (!isFeedMap(feedMap) || !feedMap.gaps.length) return '';
  const lines = feedMap.gaps.map((g) => {
    const f = g.fills || {};
    return en
      ? `- Gap in their Instagram grid (${g.label_en}; ${g.evidence}): prioritize a ${f.format || ''} about ${f.tema || ''} — ${f.angulo_en || ''}. Do NOT repeat the dominant format (${feedMap.dominant_format || '?'}) for this slot.`
      : `- Hueco en su grilla de Instagram (${g.label_es}; ${g.evidence}): priorizá un ${f.format || ''} de ${f.tema || ''} — ${f.angulo_es || ''}. NO repitas el formato dominante (${feedMap.dominant_format || '?'}) en ese lugar.`;
  });
  return (en ? 'FEED MAP — gaps to cover this week (real data from their last posts):\n' : 'MAPA DEL FEED — huecos a tapar esta semana (datos reales de sus últimos posteos):\n') + lines.join('\n');
}

// ¿Esta idea tapa este hueco? Formato igual al fills.format, o — para
// los huecos de gente — tema/ángulo de personas aunque el formato sea
// foto (una foto con gente tapa 'sin_caras' aunque no sea video).
function pickFillsGap(idea, gap) {
  if (!idea || typeof idea !== 'object' || !gap || !gap.fills) return false;
  const fmt = String(idea.tipo || idea.formato || idea.format || idea.type || '').toLowerCase();
  const normFmt = fmt === 'reel' ? 'video' : (fmt === 'carousel' ? 'carrusel' : (fmt === 'imagen' || fmt === 'image' ? 'foto' : fmt));
  const text = [idea.titulo || '', idea.angulo || '', idea.porque || '', idea.tema || '', idea.theme || ''].join(' ');
  const tema = String(idea.tema || idea.theme || '').toLowerCase();
  if (normFmt === gap.fills.format) {
    if (gap.key === 'sin_caras' || gap.key === 'solo_producto') {
      // Un reel/foto de producto solo NO tapa el hueco de caras: tiene
      // que hablar de gente.
      return PEOPLE_WORDS.test(text) || tema === 'detras_de_escena' || tema === 'gente' || tema === 'comunidad' || tema === 'testimonio';
    }
    return true;
  }
  if ((gap.key === 'sin_caras' || gap.key === 'solo_producto') && (PEOPLE_WORDS.test(text) || tema === 'detras_de_escena' || tema === 'gente' || tema === 'comunidad' || tema === 'testimonio')) return true;
  return false;
}

// El plan de la semana USA el mapa: reordena el pool para que dentro de
// los primeros `deficit` picks haya al menos una idea que tape cada
// hueco, canjeando con el buffer (picks más allá del déficit) — mismo
// patrón de canje ventana/buffer que el rebalance de intención y el
// cerebro comercial. Nunca inventa ideas ni vacía el pool: si no hay
// idea que tape un hueco, ese hueco queda sin cubrir y se reporta.
// Devuelve { pool, applied, moves: [{gap, from, to}], gapsCovered: [] }.
function applyFeedMapToPool(pool, feedMap, deficit) {
  const orig = Array.isArray(pool) ? pool : [];
  const fail = { pool: orig, applied: false, moves: [], gapsCovered: [] };
  try {
    if (!isFeedMap(feedMap) || !feedMap.gaps.length || !orig.length) return fail;
    const d = (typeof deficit === 'number' && deficit > 0) ? Math.floor(deficit) : Math.min(orig.length, 3);
    const out = orig.slice();
    const moves = [];
    const gapsCovered = [];
    const windowEnd = Math.min(d, out.length);
    const usedSlots = new Set();
    for (const gap of feedMap.gaps) {
      // ¿Ya hay una idea que tape este hueco dentro de la ventana?
      let covered = false;
      for (let i = 0; i < windowEnd; i++) {
        if (pickFillsGap(out[i], gap)) { covered = true; break; }
      }
      if (covered) { gapsCovered.push(gap.key); continue; }
      // Buscar en el buffer (fuera de la ventana) la primera que lo tape.
      let bufIdx = -1;
      for (let i = windowEnd; i < out.length; i++) {
        if (pickFillsGap(out[i], gap)) { bufIdx = i; break; }
      }
      if (bufIdx < 0) continue; // sin idea que lo tape: hueco sin cubrir, sin inventar
      // Canjear por el ÚLTIMO pick libre de la ventana (el menos
      // prioritario que todavía no tapa otro hueco): sin esto, dos
      // huecos seguidos pisarían el mismo slot y el primero quedaría
      // descubierto de nuevo.
      let slot = -1;
      for (let i = windowEnd - 1; i >= 0; i--) {
        if (!usedSlots.has(i)) { slot = i; break; }
      }
      if (slot < 0) continue;
      usedSlots.add(slot);
      const tmp = out[slot];
      out[slot] = out[bufIdx];
      out[bufIdx] = tmp;
      moves.push({ gap: gap.key, from: bufIdx, to: slot });
      gapsCovered.push(gap.key);
    }
    if (!moves.length) return { pool: orig, applied: false, moves, gapsCovered };
    return { pool: out, applied: true, moves, gapsCovered };
  } catch (_) { return fail; }
}

module.exports = {
  FEEDMAP_VERSION,
  WINDOW_MIN,
  WINDOW_MAX,
  FORMAT_OF_TYPE,
  GAP_KEYS,
  GAP_FILLS,
  buildFeedMap,
  feedMapGoalLines,
  feedMapBriefLines,
  applyFeedMapToPool,
  pickFillsGap,
  feedMapFromDigest,
  isFeedMap,
  hueBucketFromHex,
  hueName,
};
