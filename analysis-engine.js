// analysis-engine.js — El cerebro de análisis de Posty (decisiones de Valentino, 2026-10-19).
//
// UNA sola fuente de verdad para "qué vio Posty de esta cuenta y qué decidió":
//   - Radiografía de la cuenta (ritmo, huecos, formatos, horarios, captions, paleta).
//   - Análisis de mercado: competencia directa (3–5 cuentas del mismo rubro/zona)
//     y posición en el rubro, SOLO cuando hay datos reales.
//   - Plan de nacimiento para cuentas que recién arrancan (sin diagnóstico falso:
//     posicionamiento + kit de perfil + primeras 9 piezas como vidriera).
//   - El PORQUÉ de cada posteo: una línea legible por el cliente, atada al
//     hallazgo que originó la pieza y a su intención.
//   - El loop: cada análisis guarda predicciones/objetivos; el siguiente los
//     contrasta contra las señales nuevas (predicción vs resultado).
//
// REGLAS DURAS (regla de verdad):
//   - Ningún hallazgo afirma un número sin evidencia: todo finding con dígitos
//     en su texto lleva `evidence:{metric,value,source}`. enforceEvidence()
//     DESCARTA (fail-closed) cualquier finding que viole esto.
//   - Lo que no se puede medir se marca `sin-datos`, jamás se inventa.
//   - Tono: amable, profesional, alentador. lintTone() bloquea vocabulario de
//     reto/sermón; las líneas que Posty muestra al cliente pasan por ahí.
//
// Este módulo NO hace red ni IA: recibe datos planos (perfil, posteos,
// fundamento, pares) y devuelve el objeto de análisis. Lo alimentan
// feed-audit.js (datos públicos), client-digest.js (fundamento) e
// insights.js (cuentas conectadas). Persistencia por cuenta:
// saveAnalysis/latestAnalysis (tabla account_analysis).
'use strict';

const VERSION = 1;

// ---------------------------------------------------------------------------
// Tono — vocabulario prohibido en líneas visibles al cliente (reto/sermón).
// ---------------------------------------------------------------------------
const SCOLDING_WORDS = [
  'pésim', 'pesim', 'desastre', 'desastroso', 'vergüenza', 'verguenza',
  'abandonad', 'inaceptable', 'lamentable', 'horrible', 'dejadez',
  'malísimo', 'malisimo', 'mediocre', 'no servís', 'no servis',
  'un desastre', 'muy mal', 'pobre desempeño', 'fracaso',
];
function lintTone(text) {
  const t = String(text || '').toLowerCase();
  const hits = SCOLDING_WORDS.filter((w) => t.includes(w));
  return { ok: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// Evidencia — un finding con números en el texto EXIGE evidence con valor.
// ---------------------------------------------------------------------------
function hasDigits(s) { return /\d/.test(String(s == null ? '' : s)); }
function findingViolatesEvidence(f) {
  if (!f || typeof f !== 'object') return true;
  const claims = hasDigits(f.text) || hasDigits(f.now);
  if (!claims) return false;
  const ev = f.evidence;
  return !(ev && typeof ev === 'object' && ev.metric && ev.value != null && ev.source);
}
/* Fail-closed: devuelve el análisis sin los findings que afirman números sin
 * evidencia. Nunca reescribe: lo que no se puede sostener, no se muestra. */
function enforceEvidence(analysis) {
  if (!analysis || typeof analysis !== 'object') return { analysis, dropped: [] };
  const dropped = [];
  const clean = (list, where) => (Array.isArray(list) ? list.filter((f) => {
    if (findingViolatesEvidence(f)) { dropped.push({ where, key: f && f.key || null }); return false; }
    return true;
  }) : list);
  if (Array.isArray(analysis.findings)) analysis.findings = clean(analysis.findings, 'findings');
  if (analysis.market && Array.isArray(analysis.market.findings)) {
    analysis.market.findings = clean(analysis.market.findings, 'market');
  }
  analysis.dropped_findings = dropped.length;
  return { analysis, dropped };
}

// ---------------------------------------------------------------------------
// Señales determinísticas desde posteos crudos (misma matemática auditada de
// feed-audit: ritmo con piso de 7 días, huecos, mix, franjas UTC-3, ganchos).
// ---------------------------------------------------------------------------
const HOOK_RE = /[¿¡]|escrib|reserv|pedí|pedi|mirá|mira|vení|veni|probá|proba|aprovech|comentá|comenta|guardá|guarda|compart|sumate|anotá|anota|hacé|hace|descubr|conocé|conoce|encarg|empezá|empeza|agendá|agenda/i;

function signalsFromPosts(posts) {
  const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object');
  const n = list.length;
  const withTs = list
    .filter((p) => Number.isFinite(p.taken_at) && p.taken_at > 0)
    .map((p) => p.taken_at)
    .sort((a, b) => a - b);
  const types = { GraphImage: 0, GraphVideo: 0, GraphSidecar: 0 };
  list.forEach((p) => { if (types[p.type] !== undefined) types[p.type]++; });
  const s = {
    n_posts: n,
    videos: types.GraphVideo,
    images: types.GraphImage,
    carousels: types.GraphSidecar,
    posts_per_week: null,
    max_gap_days: null,
    days_since_last: null,
    hour_bands: null,
    top_band_share: null,
    hook_pct: null,
    captions_n: 0,
    avg_likes: null,
  };
  if (withTs.length >= 2) {
    const spanDays = Math.max(7, (withTs[withTs.length - 1] - withTs[0]) / 86400);
    s.posts_per_week = Math.round((withTs.length / (spanDays / 7)) * 10) / 10;
    let maxGap = 0;
    for (let i = 1; i < withTs.length; i++) maxGap = Math.max(maxGap, Math.round((withTs[i] - withTs[i - 1]) / 86400));
    s.max_gap_days = maxGap;
  }
  if (withTs.length >= 1) {
    const nowSec = Math.floor(Date.now() / 1000);
    s.days_since_last = Math.max(0, Math.round((nowSec - withTs[withTs.length - 1]) / 86400));
  }
  if (withTs.length >= 5) {
    const bands = [0, 0, 0, 0, 0, 0];
    withTs.forEach((ts) => {
      const h = new Date((ts - 3 * 3600) * 1000).getUTCHours();
      bands[Math.floor(h / 4)]++;
    });
    s.hour_bands = bands.filter((c) => c > 0).length;
    s.top_band_share = Math.round((Math.max.apply(null, bands) / withTs.length) * 100) / 100;
  }
  const caps = list.map((p) => String(p.caption || '').trim()).filter(Boolean);
  s.captions_n = caps.length;
  if (caps.length >= 3) {
    let hooked = 0;
    caps.forEach((c) => {
      const open = (c.split(/(?<=[.!?…])\s+/)[0] || c).slice(0, 80);
      if (HOOK_RE.test(open)) hooked++;
    });
    s.hook_pct = Math.round((hooked / caps.length) * 100);
  }
  const likes = list.map((p) => (Number.isFinite(p.likes) ? p.likes : null)).filter((x) => x != null);
  if (likes.length >= 3) s.avg_likes = Math.round(likes.reduce((a, b) => a + b, 0) / likes.length);
  return s;
}

function fmtRate(x) {
  if (x == null) return '';
  return Number.isInteger(x) ? String(x) : String(x).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Findings de la cuenta — MISMO copy auditado de trialAuditFromData, pero con
// evidence nativo y la decisión de la semana atada a cada hallazgo.
// ---------------------------------------------------------------------------
function accountFindings(signals, ctx = {}) {
  const s = signals || {};
  const postsPerWeek = ctx.postsPerWeek || 7;
  const findings = [];
  const F = (key, group, text, now, withPosty, evidence, decision) => {
    const f = { key, group, text, now, with_posty: withPosty, evidence: evidence || null };
    if (decision) f.decision = decision;
    findings.push(f);
  };

  if (s.posts_per_week != null && s.posts_per_week < 4) {
    F('ritmo', 'incrementar',
      'Tu ritmo de publicación tiene mucho para crecer',
      fmtRate(s.posts_per_week) + ' posteos por semana',
      postsPerWeek + ' por semana: tu semana completa, armada y programada',
      { metric: 'posts_per_week', value: s.posts_per_week, source: ctx.source || 'instagram' },
      'La semana sale pareja y completa: ' + postsPerWeek + ' posteos, sin huecos.');
  }
  if (s.days_since_last != null && s.days_since_last >= 7) {
    F('silencio', 'reducir',
      'Cada día sin publicar es un día que tu negocio no aparece',
      'hace ' + s.days_since_last + ' días que no publicás',
      '0 días en silencio: tu semana se programa sola',
      { metric: 'days_since_last', value: s.days_since_last, source: ctx.source || 'instagram' },
      'La semana arranca ya: ningún día de tu grilla queda vacío.');
  } else if (s.max_gap_days != null && s.max_gap_days >= 10) {
    F('silencio', 'reducir',
      'Entre posteo y posteo tu perfil pasa rachas largas en silencio',
      'tu racha más larga fue de ' + s.max_gap_days + ' días',
      '0 días en silencio: tu semana se programa sola',
      { metric: 'max_gap_days', value: s.max_gap_days, source: ctx.source || 'instagram' },
      'Los posteos se reparten en la semana para que no haya rachas en silencio.');
  }
  if (s.n_posts >= 3) {
    if (s.videos === 0) {
      F('reels', 'incrementar',
        'Todavía no aprovechás los reels, el formato que más empuja Instagram',
        '0 reels en tus últimos ' + s.n_posts + ' posteos',
        'reels creados por Posty, dentro de tu semana',
        { metric: 'videos', value: 0, source: ctx.source || 'instagram' },
        'La semana suma reels: es el formato que más empuja y hoy no está en tu mix.');
    } else if (s.n_posts > 0 && s.videos / s.n_posts < 0.2) {
      F('reels', 'incrementar',
        'Los reels aparecen poco en tu mix de formatos',
        'solo ' + s.videos + ' de ' + s.n_posts + ' posteos son reels',
        'más reels creados por Posty, dentro de tu semana',
        { metric: 'videos', value: s.videos, source: ctx.source || 'instagram' },
        'La semana equilibra el mix: más reels, sin dejar de lado tus fotos.');
    }
  }
  if (s.hour_bands != null && s.top_band_share != null && s.hour_bands >= 4 && s.top_band_share < 0.6) {
    F('horarios', 'mejorar',
      'Tus posteos salen en horarios muy repartidos, sin una franja que se repita',
      'publicás en ' + s.hour_bands + ' franjas horarias distintas',
      'una franja fija: cada posteo sale programado, siempre en horario',
      { metric: 'hour_bands', value: s.hour_bands, source: ctx.source || 'instagram' },
      'Cada posteo sale en una franja fija, la de mejor respuesta de tu cuenta.');
  }
  if (s.hook_pct != null && s.hook_pct < 50) {
    F('captions', 'mejorar',
      'La mayoría de tus captions no abren con un gancho que frene el scroll',
      'solo el ' + s.hook_pct + '% abre con pregunta o llamado',
      'todos: cada caption abre con gancho desde el primer día',
      { metric: 'hook_pct', value: s.hook_pct, source: ctx.source || 'instagram' },
      'Cada caption de la semana abre con un gancho que frena el scroll.');
  }
  if (ctx.paletteHues != null && ctx.paletteHues >= 6) {
    F('paleta', 'mejorar',
      'Tu feed mezcla varias paletas y se ve desparejo',
      ctx.paletteHues + ' tonos dominantes distintos',
      'una sola línea visual: la tuya, aplicada en cada posteo',
      { metric: 'palette_hues', value: ctx.paletteHues, source: 'instagram' },
      'La semana sigue una sola línea visual: la de tu marca.');
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Mercado — competencia directa y posición en el rubro.
// peers: [{handle, followers, posts:[{taken_at,type,caption,likes}]}] con datos
// REALES (públicos). Sin datos suficientes, la sección se marca sin-datos:
// nunca se rellena con estimaciones.
// ---------------------------------------------------------------------------
function median(nums) {
  const a = nums.filter((x) => x != null && Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) / 2) * 10) / 10;
}

function analyzeMarket(ownSignals, peers, ctx = {}) {
  const list = (Array.isArray(peers) ? peers : []).filter((p) => p && p.handle);
  const peerSignals = list.map((p) => ({
    handle: p.handle,
    followers: Number.isFinite(p.followers) ? p.followers : null,
    signals: signalsFromPosts(p.posts || []),
  }));
  const withData = peerSignals.filter((p) => p.signals.n_posts >= 3);
  const market = {
    available: withData.length > 0,
    peers: peerSignals.map((p) => ({
      handle: p.handle,
      followers: p.followers,
      posts_per_week: p.signals.posts_per_week,
      videos: p.signals.videos,
      carousels: p.signals.carousels,
      n_posts: p.signals.n_posts,
      hook_pct: p.signals.hook_pct,
    })),
    findings: [],
    position: null,
  };
  if (!withData.length) {
    market.unavailable_reason = 'sin-datos: todavía no hay datos públicos suficientes de cuentas de tu rubro y tu zona.';
    return market;
  }
  const medCadence = median(withData.map((p) => p.signals.posts_per_week));
  const peerVideoShare = (() => {
    const tot = withData.reduce((a, p) => a + p.signals.n_posts, 0);
    const vid = withData.reduce((a, p) => a + p.signals.videos, 0);
    return tot > 0 ? Math.round((vid / tot) * 100) / 100 : null;
  })();
  const medHook = median(withData.map((p) => p.signals.hook_pct));
  const F = market.findings.push.bind(market.findings);

  if (medCadence != null) {
    const ev = { metric: 'peer_posts_per_week_median', value: medCadence, source: 'instagram' };
    if (ownSignals && ownSignals.posts_per_week != null) {
      if (ownSignals.posts_per_week < medCadence) {
        F({ key: 'mercado-ritmo', group: 'mercado', text: 'Las cuentas de tu rubro y tu zona publican más seguido que vos', now: 'la mediana del rubro es ' + fmtRate(medCadence) + ' posteos por semana y vos estás en ' + fmtRate(ownSignals.posts_per_week), with_posty: 'tu semana completa te pone a la par del rubro desde el primer día', evidence: ev, decision: 'La semana se arma completa y pareja: quedás a la par de tu rubro.' });
      } else {
        F({ key: 'mercado-ritmo', group: 'mercado', text: 'Tu constancia ya está a la altura de tu rubro — y la vamos a sostener', now: 'la mediana del rubro es ' + fmtRate(medCadence) + ' posteos por semana y vos estás en ' + fmtRate(ownSignals.posts_per_week), with_posty: 'ese ritmo, pero sin que tengas que pensarlo', evidence: ev, decision: 'La semana sostiene tu ritmo y suma los formatos que te faltan.' });
      }
    } else {
      F({ key: 'mercado-ritmo', group: 'mercado', text: 'Así publica tu rubro en tu zona', now: 'la mediana es ' + fmtRate(medCadence) + ' posteos por semana', with_posty: 'tu semana nace a ese ritmo, desde el día uno', evidence: ev, decision: 'Tu semana nace al ritmo que tu rubro ya demostró que funciona.' });
    }
  }
  if (peerVideoShare != null && peerVideoShare >= 0.25 && ownSignals && ownSignals.n_posts >= 3) {
    const ownShare = ownSignals.n_posts ? ownSignals.videos / ownSignals.n_posts : 0;
    if (ownShare < peerVideoShare - 0.1) {
      F({ key: 'mercado-formato', group: 'mercado', text: 'Tu rubro apuesta fuerte a los reels y ahí hay un hueco para vos', now: 'el ' + Math.round(peerVideoShare * 100) + '% de lo que publica tu competencia son reels', with_posty: 'reels con tu producto y tu marca, dentro de tu semana', evidence: { metric: 'peer_video_share', value: peerVideoShare, source: 'instagram' }, decision: 'La semana suma reels: es el formato que tu rubro ya validó.' });
    }
  }
  if (medHook != null && ownSignals && ownSignals.hook_pct != null && ownSignals.hook_pct < medHook) {
    F({ key: 'mercado-ganchos', group: 'mercado', text: 'Tu competencia abre mejor sus captions — eso se iguala fácil', now: 'la mediana de ganchos del rubro es ' + medHook + '% y la tuya ' + ownSignals.hook_pct + '%', with_posty: 'cada caption tuyo abre con gancho', evidence: { metric: 'peer_hook_pct_median', value: medHook, source: 'instagram' }, decision: 'Cada caption de la semana abre con un gancho que frena el scroll.' });
  }
  // Posición en el rubro: solo con ≥3 pares con cadencia medida y la propia.
  if (withData.length >= 3 && ownSignals && ownSignals.posts_per_week != null && medCadence != null) {
    const all = withData.map((p) => p.signals.posts_per_week).filter((x) => x != null);
    const rank = all.filter((x) => x > ownSignals.posts_per_week).length + 1;
    const total = all.length + 1;
    market.position = {
      basis: 'posts_per_week',
      rank, total,
      text: 'En constancia, hoy estás ' + rank + ' de ' + total + ' entre las cuentas de tu rubro y tu zona que medimos — y tu semana está pensada para subir.',
      evidence: { metric: 'peer_posts_per_week_median', value: medCadence, source: 'instagram' },
    };
  }
  return market;
}

/* Probada de mercado: 1–2 datos reales, sin el mapa completo. Es lo que ven
 * el trial y el plan Esencial (upsell honesto: el dato es verdad, el mapa
 * completo es de Growth). */
function marketTeaser(market) {
  if (!market || !market.available) return null;
  const f = (market.findings || [])[0];
  const items = [];
  if (f) items.push({ text: f.text, now: f.now });
  if (market.position) items.push({ text: 'Tu posición en el rubro ya está medida', now: 'constancia ' + market.position.rank + ' de ' + market.position.total });
  if (!items.length) {
    const cad = median((market.peers || []).map((p) => p.posts_per_week));
    if (cad != null) items.push({ text: 'Así publica tu rubro en tu zona', now: 'la mediana es ' + fmtRate(cad) + ' posteos por semana' });
  }
  return items.length ? { items, locked: true, note: 'Esto es una probada: el mapa completo de tu competencia, tu posición y las decisiones que tomamos con eso viven en tu vista Análisis.' } : null;
}

// ---------------------------------------------------------------------------
// Plan de nacimiento — cuenta nueva o vacía. NADA de diagnóstico falso: las
// "señales" de la cuenta no existen, así que los hallazgos son de PLAN, con
// evidencia del mercado, del fundamento o de sus reseñas — nunca de su feed.
// ---------------------------------------------------------------------------
const HIGHLIGHT_SETS = [
  { key: 'estrella', name: 'Lo estrella', when: 'siempre' },
  { key: 'catalogo', name: 'Catálogo', when: 'si hay productos o servicios en el fundamento' },
  { key: 'promos', name: 'Promos', when: 'solo si hay una promo real cargada' },
  { key: 'opiniones', name: 'Opiniones', when: 'solo si hay reseñas reales' },
  { key: 'como-comprar', name: 'Cómo comprar', when: 'siempre' },
  { key: 'nosotros', name: 'Nosotros', when: 'siempre' },
];

function profileKit({ business = {}, digest = null, reviews = null }) {
  const d = digest || {};
  const firstOffering = (d.productos && d.productos[0]) || (d.servicios && d.servicios[0]) || null;
  const star = (d.inferred_star && d.inferred_star.item) || (firstOffering && (firstOffering.nombre || firstOffering)) || null;
  const lines = [];
  if (star) lines.push('⭐ ' + String(star).slice(0, 42));
  else if (business.category) lines.push('✨ ' + String(business.category).slice(0, 42));
  if (d.diferencial) lines.push('💛 ' + String(d.diferencial).slice(0, 42));
  if (reviews && reviews.rating) lines.push('⭐ ' + fmtRate(reviews.rating) + ' en Google' + (reviews.total ? ' (' + reviews.total + ' reseñas)' : ''));
  if (business.city || d.ciudad) lines.push('📍 ' + String(business.city || d.ciudad).slice(0, 30));
  lines.push('👇 Tu semana de posteos, acá');
  const bio = lines.slice(0, 4).join('\n').slice(0, 150);
  const highlights = HIGHLIGHT_SETS.filter((h) => {
    if (h.key === 'promos') return Array.isArray(d.promos) && d.promos.length > 0;
    if (h.key === 'opiniones') return !!(reviews && reviews.total > 0);
    if (h.key === 'catalogo') return (d.productos || []).length + (d.servicios || []).length > 0;
    return true;
  }).map((h) => h.name);
  return {
    display_name: String(business.name || '').slice(0, 30),
    username: business.ig_username ? '@' + String(business.ig_username).replace(/^@/, '') : null,
    category_label: business.category || null,
    bio_lines: lines.slice(0, 4),
    bio,
    photo: 'la foto de perfil sale de tu logo o de tu producto estrella, con la paleta de tu marca',
    highlights,
    note: 'Kit armado desde tu web, tu fundamento y tus reseñas reales: nada se afirma sin una fuente tuya detrás.',
  };
}

function starterGrid({ digest = null, market = null, reviews = null }) {
  const d = digest || {};
  const hasPromo = Array.isArray(d.promos) && d.promos.length > 0;
  const hasReviews = !!(reviews && reviews.total > 0);
  const S = (slot, role, format, intent, why) => ({ slot, role, format, intent, why });
  const grid = [
    S(1, 'El gancho', 'post', 'vender', 'Tu producto estrella abre la vidriera: es lo primero que un cliente nuevo tiene que ver.'),
    S(2, 'El estrella de cerca', 'post', 'vender', 'El detalle de lo que mejor hacés, mostrado como se merece.'),
    S(3, 'Detrás de escena', 'reel', 'autoridad', 'Cómo se hace lo tuyo: el proceso real genera confianza más que cualquier placa.'),
    S(4, 'Tu historia', 'post', 'autoridad', 'Quiénes están detrás del negocio: la gente conecta con personas, no con logos.'),
    S(5, 'El educativo', 'carrusel', 'consultas', 'Un consejo útil de tu rubro te posiciona como el que sabe — y trae preguntas reales.'),
    hasPromo
      ? S(6, 'La oferta real', 'post', 'vender', 'Tu promo vigente, con precio y condiciones reales: la vidriera también vende.')
      : S(6, 'El servicio clave', 'post', 'consultas', 'El servicio que más te piden, explicado simple: baja las preguntas repetidas.'),
    S(7, 'La pregunta', 'post', 'consultas', 'Una pregunta a tu comunidad: los primeros comentarios valen oro para el algoritmo y para vos.'),
    S(8, 'El detalle', 'post', 'vender', 'Un segundo producto o detalle de tu trabajo: amplitud sin perder foco.'),
    hasReviews
      ? S(9, 'La prueba', 'post', 'prueba', 'Una opinión real de tus clientes cierra la vidriera: lo que otros ya vivieron vende por vos.')
      : S(9, 'La invitación', 'post', 'consultas', 'El cierre de la vidriera invita a escribirte: simple, directo y con tu forma de atender.'),
  ];
  if (market && market.available) {
    const cad = median((market.peers || []).map((p) => p.posts_per_week));
    if (cad != null) grid.market_note = 'El ritmo y los formatos de esta vidriera salen de lo que ya funciona en tu rubro y tu zona (mediana: ' + fmtRate(cad) + ' posteos por semana).';
  }
  return grid;
}

function coldFindings({ digest = null, market = null, reviews = null }) {
  const d = digest || {};
  const findings = [];
  findings.push({
    key: 'nacimiento', group: 'plan',
    text: 'Tu cuenta nace con estrategia, no desde cero',
    now: 'no hay historial que corregir: cada posteo sale pensado desde el primero',
    with_posty: 'posicionamiento, kit de perfil y tu primera vidriera de 9 piezas',
    evidence: null,
    decision: 'La cuenta nace completa: perfil armado y las primeras 9 piezas como vidriera.',
  });
  const star = (d.inferred_star && d.inferred_star.item) || ((d.productos || [])[0] && ((d.productos[0].nombre || d.productos[0]))) || ((d.servicios || [])[0] && ((d.servicios[0].nombre || d.servicios[0]))) || null;
  if (star) {
    findings.push({
      key: 'estrella', group: 'plan',
      text: 'Tu producto estrella abre la vidriera',
      now: String(star),
      with_posty: 'las primeras piezas giran alrededor de lo que mejor vendés',
      evidence: { metric: 'digest_star', value: String(star), source: 'fundamento' },
      decision: 'La vidriera abre con tu producto estrella.',
    });
  }
  if (reviews && reviews.rating) {
    findings.push({
      key: 'resenas', group: 'plan',
      text: 'Ya tenés reputación — ahora se va a ver en Instagram',
      now: fmtRate(reviews.rating) + ' estrellas en Google' + (reviews.total ? ' con ' + reviews.total + ' reseñas' : ''),
      with_posty: 'esa confianza, también en tu perfil de Instagram',
      evidence: { metric: 'google_rating', value: reviews.rating, source: 'google' },
      decision: 'El kit de perfil lleva tu reputación de Google a la bio.',
    });
  }
  if (market && market.available) {
    (market.findings || []).slice(0, 2).forEach((f) => findings.push(f));
  }
  return findings;
}

// ---------------------------------------------------------------------------
// El loop — predicciones de este análisis y contraste del anterior.
// Los objetivos son del PLAN (lo que Posty controla), nunca promesas de
// alcance o ventas. evaluateLoop solo afirma cuando hay señal de ambos lados.
// ---------------------------------------------------------------------------
function buildPredictions(analysis, ctx = {}) {
  const postsPerWeek = ctx.postsPerWeek || 7;
  const preds = [
    { key: 'posts_per_week', label: 'posteos por semana', target: postsPerWeek, kind: 'objetivo', note: 'la semana completa, sin huecos' },
    { key: 'max_gap_days', label: 'racha máxima sin publicar (días)', target: 2, kind: 'objetivo', compare: 'lte', note: 'ninguna racha larga en silencio' },
  ];
  const hasReelFinding = (analysis.findings || []).some((f) => f.key === 'reels');
  if (hasReelFinding || analysis.kind === 'nacimiento') {
    preds.push({ key: 'videos', label: 'reels en la ventana reciente', target: 1, kind: 'objetivo', compare: 'gte', note: 'el formato que más empuja, presente en tu mix' });
  }
  return preds;
}

function evaluateLoop(prior, currentSignals) {
  if (!prior || !Array.isArray(prior.predictions) || !prior.predictions.length) return null;
  const s = currentSignals || {};
  const checks = prior.predictions.map((p) => {
    const actual = s[p.key];
    if (actual == null || !Number.isFinite(actual)) {
      return { key: p.key, label: p.label, target: p.target, actual: null, status: 'sin-datos', text: 'Todavía no hay datos nuevos para medir "' + p.label + '".' };
    }
    const ok = p.compare === 'lte' ? actual <= p.target : actual >= p.target;
    let improved = null;
    if (prior.signals && prior.signals[p.key] != null && Number.isFinite(prior.signals[p.key])) {
      improved = p.compare === 'lte' ? actual < prior.signals[p.key] : actual > prior.signals[p.key];
    }
    const status = ok ? 'cumplida' : (improved ? 'en-curso' : 'en-curso');
    const text = ok
      ? 'Objetivo cumplido: "' + p.label + '" llegó a ' + fmtRate(actual) + ' (la meta era ' + fmtRate(p.target) + ').'
      : 'Vamos en camino: "' + p.label + '" está en ' + fmtRate(actual) + ' y la meta es ' + fmtRate(p.target) + ' — la semana que viene sigue empujando ahí.';
    return { key: p.key, label: p.label, target: p.target, actual, status, text };
  });
  return { from_n: prior.n || null, from_date: prior.created_at || null, checks };
}

// ---------------------------------------------------------------------------
// El PORQUÉ de cada posteo — una línea legible por el cliente.
// Prioridad: (1) el porque que ya trae la idea generada, si pasa el lint de
// tono y no afirma números sin respaldo del análisis/fundamento; (2) la
// decisión del hallazgo que originó la pieza; (3) el ancla del fundamento
// (un producto/servicio real del negocio). Sin ninguna de las tres: una línea
// honesta de estrategia sin afirmaciones medibles.
// ---------------------------------------------------------------------------
const INTENT_WHY = {
  vender: 'Porque está pensado para vender',
  reservar: 'Porque está pensado para que te reserven',
  consultas: 'Porque está pensado para traerte consultas',
  prueba: 'Porque muestra prueba real de tu trabajo',
  autoridad: 'Porque te posiciona como el que sabe de tu rubro',
};
const FINDING_FOR_FORMAT = { reel: 'reels', video: 'reels' };
const FINDING_FOR_TIPO = { promo: 'estrella', novedad: 'estrella' };

function whyForPost(post, analysis, digest) {
  if (!post || typeof post !== 'object') return null;
  const candidates = [];
  const porque = String(post.porque || post.why || '').trim();
  if (porque) candidates.push(porque);
  const a = analysis || {};
  const findings = [].concat(a.findings || [], (a.market && a.market.findings) || []);
  const byKey = {};
  findings.forEach((f) => { if (f && f.key) byKey[f.key] = f; });
  const format = String(post.formato || post.format || post.tipo || '').toLowerCase();
  const tipo = String(post.tipo || '').toLowerCase();
  const fk = FINDING_FOR_FORMAT[format] || FINDING_FOR_TIPO[tipo];
  if (fk && byKey[fk] && byKey[fk].decision) candidates.push(byKey[fk].decision);
  if (tipo === 'promo' && byKey.ritmo && byKey.ritmo.decision) candidates.push(byKey.ritmo.decision);
  const d = digest || {};
  const anchor = ((d.productos || [])[0] && (d.productos[0].nombre || d.productos[0])) ||
    ((d.servicios || [])[0] && (d.servicios[0].nombre || d.servicios[0])) || null;
  if (anchor) candidates.push('Porque muestra ' + String(anchor) + ', uno de los fuertes de tu negocio, con tu línea visual.');
  const intent = String(post.salesIntent || post.intent || post.intencion || '').toLowerCase();
  if (INTENT_WHY[intent]) candidates.push(INTENT_WHY[intent] + ': sale en tu mejor franja y con un gancho que frena el scroll.');
  candidates.push('Porque forma parte de una semana pensada como un todo: cada pieza cumple un rol distinto en tu grilla.');

  for (const c of candidates) {
    const line = String(c || '').trim().replace(/\s+/g, ' ');
    if (!line) continue;
    if (!lintTone(line).ok) continue;
    if (hasDigits(line)) {
      // Un número en el porqué solo pasa si CADA número de la línea está
      // respaldado, token a token, por una evidencia del análisis o por el
      // fundamento (nada de matches por substring: "0" no respalda "5000").
      const nums = (line.match(/\d+[.,]?\d*/g) || []).map((x) => x.replace(',', '.'));
      const evVals = new Set(findings.filter((f) => f.evidence).map((f) => String(f.evidence.value).replace(',', '.')));
      const digestNums = new Set((JSON.stringify(d || {}).match(/\d+[.,]?\d*/g) || []).map((x) => x.replace(',', '.')));
      if (!nums.every((n) => evVals.has(n) || digestNums.has(n))) continue;
    }
    return line.length > 180 ? line.slice(0, 177).trim() + '…' : line;
  }
  return null;
}

/* Resumen de apertura de la semana (Schedule): "lo que vi → por qué tu
 * semana es así", 2–3 líneas, desde los hallazgos con decisión. */
function weekSummary(analysis) {
  if (!analysis) return null;
  const findings = (analysis.findings || []).filter((f) => f && f.decision);
  if (!findings.length) return null;
  const top = findings.slice(0, 2);
  const seen = top.map((f) => {
    const claim = f.now ? (f.text.charAt(0).toLowerCase() + f.text.slice(1) + ' (' + f.now + ')') : (f.text.charAt(0).toLowerCase() + f.text.slice(1));
    return claim;
  }).join('. También ');
  const decided = top.map((f) => f.decision.charAt(0).toLowerCase() + f.decision.slice(1)).join(' ');
  const lines = [
    'Esta semana miré tu cuenta y vi que ' + seen + '.',
    'Por eso tu semana es así: ' + decided,
  ];
  if (analysis.kind === 'nacimiento') {
    lines[0] = 'Tu cuenta recién arranca, así que armé el plan desde tu rubro, tu zona y lo mejor de tu negocio.';
    lines[1] = 'Por eso tu semana es así: ' + decided;
  }
  const out = lines.join('\n');
  return lintTone(out).ok ? out : lines[0];
}

// ---------------------------------------------------------------------------
// Construcción del análisis completo.
// mode 'existing': profile {followers, posts_count, bio} + posts crudos.
// mode 'cold': sin posts (o cuenta inexistente/vacía) — plan de nacimiento.
// ctx: {postsPerWeek, plan, paletteHues, insights:{bestHour}, digest, peers,
//       reviews, business:{name,category,city,ig_username}, prior}
// ---------------------------------------------------------------------------
function baseAnalysis(kind, ctx) {
  return {
    version: VERSION,
    kind, // 'cuenta' | 'nacimiento'
    created_at: new Date().toISOString(),
    plan_layer: ctx.plan || 'trial',
    findings: [],
    signals: null,
    market: null,
    profile_kit: null,
    starter_grid: null,
    predictions: [],
    loop: null,
    data_notes: [],
  };
}

function analyzeExisting({ profile = {}, posts = [], ctx = {} } = {}) {
  const a = baseAnalysis('cuenta', ctx);
  const signals = signalsFromPosts(posts);
  if (ctx.paletteHues != null) signals.palette_hues = ctx.paletteHues;
  a.signals = signals;
  a.findings = accountFindings(signals, ctx);
  if (ctx.insights && ctx.insights.bestHour != null) {
    a.data_notes.push('Cuenta conectada: los horarios se afinan con tus métricas reales.');
    a.insights = { best_hour: ctx.insights.bestHour };
  } else {
    a.data_notes.push('Análisis con datos públicos de tu perfil; al conectar tu cuenta se vuelve más preciso con tus métricas reales.');
  }
  a.market = analyzeMarket(signals, ctx.peers || [], ctx);
  if (ctx.prior) a.loop = evaluateLoop(ctx.prior, signals);
  a.predictions = buildPredictions(a, ctx);
  const { analysis } = enforceEvidence(a);
  return analysis;
}

function analyzeColdStart({ business = {}, digest = null, peers = [], reviews = null, ctx = {} } = {}) {
  const a = baseAnalysis('nacimiento', ctx);
  a.signals = null; // no hay cuenta que medir: jamás un número de feed.
  a.market = analyzeMarket(null, peers, ctx);
  a.findings = coldFindings({ digest, market: a.market, reviews });
  a.profile_kit = profileKit({ business, digest, reviews });
  a.starter_grid = starterGrid({ digest, market: a.market, reviews });
  if (ctx.prior) a.loop = evaluateLoop(ctx.prior, {});
  a.predictions = buildPredictions(a, ctx);
  const { analysis } = enforceEvidence(a);
  return analysis;
}

/* Detección de arranque: sin IG, perfil inexistente o feed vacío/casi vacío. */
function isColdStart({ hasIg, profile, posts } = {}) {
  if (!hasIg) return true;
  if (!profile) return true;
  const n = Array.isArray(posts) ? posts.length : 0;
  const total = Number.isFinite(profile.posts_count) ? profile.posts_count : n;
  return n < 3 && total < 3;
}

/* Gateo por plan (se aplica en la capa de render, el objeto completo queda
 * persistido): la radiografía de SU cuenta es de todos los planes; el mercado
 * completo es Growth (pro/total); esencial y trial reciben la probada. */
function gateForPlan(analysis, planId) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  const view = JSON.parse(JSON.stringify(analysis));
  const full = planId === 'pro' || planId === 'total';
  view.market_full = full;
  if (!full && view.market) {
    view.market_teaser = marketTeaser(view.market);
    view.market = { available: view.market.available, locked: true, peers: [], findings: [], position: null };
  }
  return view;
}

// ---------------------------------------------------------------------------
// Persistencia por cuenta — el loop necesita historia: análisis #N lee al
// #N-1 (sus predicciones y señales) antes de contrastar.
// ---------------------------------------------------------------------------
function ensureAnalysisTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS account_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT DEFAULT 'cuenta',
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_account_analysis_user ON account_analysis (user_id, id)');
  } catch (e) { /* defensivo: la tabla se crea al primer uso real */ }
}

function saveAnalysis(db, userId, analysis) {
  if (!db || !userId || !analysis) return null;
  ensureAnalysisTable(db);
  const count = db.prepare('SELECT COUNT(*) AS c FROM account_analysis WHERE user_id = ?').get(userId);
  const n = (count ? count.c : 0) + 1;
  const stored = Object.assign({}, analysis, { n });
  const info = db.prepare('INSERT INTO account_analysis (user_id, kind, payload) VALUES (?, ?, ?)')
    .run(userId, stored.kind || 'cuenta', JSON.stringify(stored));
  return { id: info.lastInsertRowid, n, analysis: stored };
}

function latestAnalysis(db, userId) {
  if (!db || !userId) return null;
  try {
    ensureAnalysisTable(db);
    const rows = db.prepare('SELECT id, payload FROM account_analysis WHERE user_id = ? ORDER BY id DESC LIMIT 2').all(userId);
    if (!rows.length) return null;
    const parse = (r) => { try { const o = JSON.parse(r.payload); o.id = r.id; return o; } catch (e) { return null; } };
    const current = parse(rows[0]);
    if (current && rows[1]) {
      const prior = parse(rows[1]);
      if (prior) current.prior = { n: prior.n || null, created_at: prior.created_at || null };
    }
    return current;
  } catch (e) { return null; }
}

/* El análisis previo SIN pisar: lo que el loop contrasta al construir el nuevo. */
function priorAnalysis(db, userId) {
  if (!db || !userId) return null;
  try {
    ensureAnalysisTable(db);
    const r = db.prepare('SELECT payload FROM account_analysis WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
    if (!r) return null;
    const o = JSON.parse(r.payload);
    return o && typeof o === 'object' ? o : null;
  } catch (e) { return null; }
}

function analysisHistory(db, userId, limit = 6) {
  if (!db || !userId) return [];
  try {
    ensureAnalysisTable(db);
    const rows = db.prepare('SELECT id, kind, payload, created_at FROM account_analysis WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
    return rows.map((r, i) => {
      let o = null;
      try { o = JSON.parse(r.payload); } catch (e) {}
      return {
        id: r.id,
        n: o && o.n != null ? o.n : null,
        kind: r.kind,
        created_at: r.created_at,
        findings: o && Array.isArray(o.findings) ? o.findings.length : 0,
        loop_checks: o && o.loop && Array.isArray(o.loop.checks) ? o.loop.checks : null,
      };
    });
  } catch (e) { return []; }
}

module.exports = {
  VERSION,
  SCOLDING_WORDS,
  lintTone,
  hasDigits,
  findingViolatesEvidence,
  enforceEvidence,
  signalsFromPosts,
  accountFindings,
  analyzeMarket,
  marketTeaser,
  profileKit,
  starterGrid,
  coldFindings,
  buildPredictions,
  evaluateLoop,
  whyForPost,
  weekSummary,
  analyzeExisting,
  analyzeColdStart,
  isColdStart,
  gateForPlan,
  ensureAnalysisTable,
  saveAnalysis,
  latestAnalysis,
  priorAnalysis,
  analysisHistory,
};
