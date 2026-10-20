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
// (v274 · MODO EN) Equivalente EN del vocabulario de reto: el lint de tono
// corre también sobre las líneas en inglés (misma vara: nada de sermón).
const SCOLDING_WORDS_EN = [
  'terrible', 'awful', 'disaster', 'shameful', 'unacceptable', 'pathetic',
  'hopeless', 'failure', 'you failed', 'very bad', 'poor performance',
  'mediocre', 'lazy', 'abandoned your',
];
function lintTone(text, lang) {
  const t = String(text || '').toLowerCase();
  const words = lang === 'en' ? SCOLDING_WORDS_EN : SCOLDING_WORDS;
  const hits = words.filter((w) => t.includes(w));
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
// (v274) Imperativos EN sumados al hook: la medición de ganchos lee feeds
// en los dos idiomas (las palabras EN no aparecen en captions ES).
const HOOK_RE = /[¿¡]|escrib|reserv|pedí|pedi|mirá|mira|vení|veni|probá|proba|aprovech|comentá|comenta|guardá|guarda|compart|sumate|anotá|anota|hacé|hace|descubr|conocé|conoce|encarg|empezá|empeza|agendá|agenda|\b(book|save|comment|tag|order|try|discover|join|tap|share|message|stop scrolling|check out|grab|shop now)\b/i;

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

function fmtRate(x, lang) {
  if (x == null) return '';
  if (lang === 'en') return String(x); // EN: separador decimal con punto
  return Number.isInteger(x) ? String(x) : String(x).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Findings de la cuenta — MISMO copy auditado de trialAuditFromData, pero con
// evidence nativo y la decisión de la semana atada a cada hallazgo.
// ---------------------------------------------------------------------------
function accountFindings(signals, ctx = {}) {
  const s = signals || {};
  const en = ctx.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const fr = (x) => fmtRate(x, ctx.lang);
  const postsPerWeek = ctx.postsPerWeek || 7;
  const findings = [];
  const F = (key, group, text, now, withPosty, evidence, decision) => {
    const f = { key, group, text, now, with_posty: withPosty, evidence: evidence || null };
    if (decision) f.decision = decision;
    findings.push(f);
  };

  if (s.posts_per_week != null && s.posts_per_week < 4) {
    F('ritmo', 'incrementar',
      T('Tu ritmo de publicación tiene mucho para crecer', 'Your posting rhythm has plenty of room to grow'),
      fr(s.posts_per_week) + T(' posteos por semana', ' posts per week'),
      postsPerWeek + T(' por semana: tu semana completa, armada y programada', ' per week: your full week, built and scheduled'),
      { metric: 'posts_per_week', value: s.posts_per_week, source: ctx.source || 'instagram' },
      T('La semana sale pareja y completa: ' + postsPerWeek + ' posteos, sin huecos.', 'The week comes out even and complete: ' + postsPerWeek + ' posts, no gaps.'));
  }
  if (s.days_since_last != null && s.days_since_last >= 7) {
    F('silencio', 'reducir',
      T('Cada día sin publicar es un día que tu negocio no aparece', 'Every day without posting is a day your business does not show up'),
      T('hace ' + s.days_since_last + ' días que no publicás', 'it has been ' + s.days_since_last + ' days since your last post'),
      T('0 días en silencio: tu semana se programa sola', '0 silent days: your week schedules itself'),
      { metric: 'days_since_last', value: s.days_since_last, source: ctx.source || 'instagram' },
      T('La semana arranca ya: ningún día de tu grilla queda vacío.', 'The week starts right away: no day on your grid stays empty.'));
  } else if (s.max_gap_days != null && s.max_gap_days >= 10) {
    F('silencio', 'reducir',
      T('Entre posteo y posteo tu perfil pasa rachas largas en silencio', 'Between posts, your profile goes through long silent stretches'),
      T('tu racha más larga fue de ' + s.max_gap_days + ' días', 'your longest stretch was ' + s.max_gap_days + ' days'),
      T('0 días en silencio: tu semana se programa sola', '0 silent days: your week schedules itself'),
      { metric: 'max_gap_days', value: s.max_gap_days, source: ctx.source || 'instagram' },
      T('Los posteos se reparten en la semana para que no haya rachas en silencio.', 'Posts are spread across the week so there are no silent stretches.'));
  }
  if (s.n_posts >= 3) {
    if (s.videos === 0) {
      F('reels', 'incrementar',
        T('Todavía no aprovechás los reels, el formato que más empuja Instagram', 'You are not using reels yet — the format Instagram pushes the most'),
        T('0 reels en tus últimos ' + s.n_posts + ' posteos', '0 reels in your last ' + s.n_posts + ' posts'),
        T('reels creados por Posty, dentro de tu semana', 'reels created by Posty, inside your week'),
        { metric: 'videos', value: 0, source: ctx.source || 'instagram' },
        T('La semana suma reels: es el formato que más empuja y hoy no está en tu mix.', 'The week adds reels: it is the format that pushes the most and it is not in your mix today.'));
    } else if (s.n_posts > 0 && s.videos / s.n_posts < 0.2) {
      F('reels', 'incrementar',
        T('Los reels aparecen poco en tu mix de formatos', 'Reels show up very little in your format mix'),
        T('solo ' + s.videos + ' de ' + s.n_posts + ' posteos son reels', 'only ' + s.videos + ' of your ' + s.n_posts + ' posts are reels'),
        T('más reels creados por Posty, dentro de tu semana', 'more reels created by Posty, inside your week'),
        { metric: 'videos', value: s.videos, source: ctx.source || 'instagram' },
        T('La semana equilibra el mix: más reels, sin dejar de lado tus fotos.', 'The week balances the mix: more reels, without dropping your photos.'));
    }
  }
  if (s.hour_bands != null && s.top_band_share != null && s.hour_bands >= 4 && s.top_band_share < 0.6) {
    F('horarios', 'mejorar',
      T('Tus posteos salen en horarios muy repartidos, sin una franja que se repita', 'Your posts go out at scattered times, with no time band that repeats'),
      T('publicás en ' + s.hour_bands + ' franjas horarias distintas', 'you post across ' + s.hour_bands + ' different time bands'),
      T('una franja fija: cada posteo sale programado, siempre en horario', 'one fixed band: every post goes out scheduled, always on time'),
      { metric: 'hour_bands', value: s.hour_bands, source: ctx.source || 'instagram' },
      T('Cada posteo sale en una franja fija, la de mejor respuesta de tu cuenta.', 'Every post goes out in one fixed band — the one your account responds to best.'));
  }
  if (s.hook_pct != null && s.hook_pct < 50) {
    F('captions', 'mejorar',
      T('La mayoría de tus captions no abren con un gancho que frene el scroll', 'Most of your captions do not open with a hook that stops the scroll'),
      T('solo el ' + s.hook_pct + '% abre con pregunta o llamado', 'only ' + s.hook_pct + '% open with a question or a call to action'),
      T('todos: cada caption abre con gancho desde el primer día', 'all of them: every caption opens with a hook from day one'),
      { metric: 'hook_pct', value: s.hook_pct, source: ctx.source || 'instagram' },
      T('Cada caption de la semana abre con un gancho que frena el scroll.', "Every caption this week opens with a hook that stops the scroll."));
  }
  if (ctx.paletteHues != null && ctx.paletteHues >= 6) {
    F('paleta', 'mejorar',
      T('Tu feed mezcla varias paletas y se ve desparejo', 'Your feed mixes several palettes and looks uneven'),
      T(ctx.paletteHues + ' tonos dominantes distintos', ctx.paletteHues + ' different dominant tones'),
      T('una sola línea visual: la tuya, aplicada en cada posteo', 'one single visual line: yours, applied to every post'),
      { metric: 'palette_hues', value: ctx.paletteHues, source: 'instagram' },
      T('La semana sigue una sola línea visual: la de tu marca.', 'The week follows one single visual line: your brand line.'));
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
  const en = ctx.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const fr = (x) => fmtRate(x, ctx.lang);
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
  market.lang = en ? 'en' : 'es';
  if (!withData.length) {
    market.unavailable_reason = T('sin-datos: todavía no hay datos públicos suficientes de cuentas de tu rubro y tu zona.', 'no-data: there is not enough public data yet from accounts in your category and your area.');
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
        F({ key: 'mercado-ritmo', group: 'mercado', text: T('Las cuentas de tu rubro y tu zona publican más seguido que vos', 'Accounts in your category and your area post more often than you'), now: T('la mediana del rubro es ' + fr(medCadence) + ' posteos por semana y vos estás en ' + fr(ownSignals.posts_per_week), 'the category median is ' + fr(medCadence) + ' posts per week and you are at ' + fr(ownSignals.posts_per_week)), with_posty: T('tu semana completa te pone a la par del rubro desde el primer día', 'your full week puts you on par with your category from day one'), evidence: ev, decision: T('La semana se arma completa y pareja: quedás a la par de tu rubro.', 'The week is built full and even: you land on par with your category.') });
      } else {
        F({ key: 'mercado-ritmo', group: 'mercado', text: T('Tu constancia ya está a la altura de tu rubro — y la vamos a sostener', 'Your consistency already matches your category — and we will keep it there'), now: T('la mediana del rubro es ' + fr(medCadence) + ' posteos por semana y vos estás en ' + fr(ownSignals.posts_per_week), 'the category median is ' + fr(medCadence) + ' posts per week and you are at ' + fr(ownSignals.posts_per_week)), with_posty: T('ese ritmo, pero sin que tengas que pensarlo', 'that same rhythm, without you having to think about it'), evidence: ev, decision: T('La semana sostiene tu ritmo y suma los formatos que te faltan.', 'The week keeps your rhythm and adds the formats you are missing.') });
      }
    } else {
      F({ key: 'mercado-ritmo', group: 'mercado', text: T('Así publica tu rubro en tu zona', 'This is how your category posts in your area'), now: T('la mediana es ' + fr(medCadence) + ' posteos por semana', 'the median is ' + fr(medCadence) + ' posts per week'), with_posty: T('tu semana nace a ese ritmo, desde el día uno', 'your week is born at that rhythm, from day one'), evidence: ev, decision: T('Tu semana nace al ritmo que tu rubro ya demostró que funciona.', 'Your week is born at the rhythm your category already proved works.') });
    }
  }
  if (peerVideoShare != null && peerVideoShare >= 0.25 && ownSignals && ownSignals.n_posts >= 3) {
    const ownShare = ownSignals.n_posts ? ownSignals.videos / ownSignals.n_posts : 0;
    if (ownShare < peerVideoShare - 0.1) {
      F({ key: 'mercado-formato', group: 'mercado', text: T('Tu rubro apuesta fuerte a los reels y ahí hay un hueco para vos', 'Your category bets big on reels — and there is a gap there for you'), now: T('el ' + Math.round(peerVideoShare * 100) + '% de lo que publica tu competencia son reels', Math.round(peerVideoShare * 100) + '% of what your competition posts are reels'), with_posty: T('reels con tu producto y tu marca, dentro de tu semana', 'reels with your product and your brand, inside your week'), evidence: { metric: 'peer_video_share', value: peerVideoShare, source: 'instagram' }, decision: T('La semana suma reels: es el formato que tu rubro ya validó.', 'The week adds reels: it is the format your category already validated.') });
    }
  }
  if (medHook != null && ownSignals && ownSignals.hook_pct != null && ownSignals.hook_pct < medHook) {
    F({ key: 'mercado-ganchos', group: 'mercado', text: T('Tu competencia abre mejor sus captions — eso se iguala fácil', 'Your competition opens their captions better — that is easy to match'), now: T('la mediana de ganchos del rubro es ' + medHook + '% y la tuya ' + ownSignals.hook_pct + '%', 'the category hook median is ' + medHook + '% and yours is ' + ownSignals.hook_pct + '%'), with_posty: T('cada caption tuyo abre con gancho', 'every caption of yours opens with a hook'), evidence: { metric: 'peer_hook_pct_median', value: medHook, source: 'instagram' }, decision: T('Cada caption de la semana abre con un gancho que frena el scroll.', "Every caption this week opens with a hook that stops the scroll.") });
  }
  // Posición en el rubro: solo con ≥3 pares con cadencia medida y la propia.
  if (withData.length >= 3 && ownSignals && ownSignals.posts_per_week != null && medCadence != null) {
    const all = withData.map((p) => p.signals.posts_per_week).filter((x) => x != null);
    const rank = all.filter((x) => x > ownSignals.posts_per_week).length + 1;
    const total = all.length + 1;
    market.position = {
      basis: 'posts_per_week',
      rank, total,
      text: T('En constancia, hoy estás ' + rank + ' de ' + total + ' entre las cuentas de tu rubro y tu zona que medimos — y tu semana está pensada para subir.', 'On consistency, today you are ' + rank + ' of ' + total + ' among the accounts in your category and area that we measured — and your week is built to climb.'),
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
  const en = market.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const f = (market.findings || [])[0];
  const items = [];
  if (f) items.push({ text: f.text, now: f.now });
  if (market.position) items.push({ text: T('Tu posición en el rubro ya está medida', 'Your position in your category is already measured'), now: T('constancia ' + market.position.rank + ' de ' + market.position.total, 'consistency ' + market.position.rank + ' of ' + market.position.total) });
  if (!items.length) {
    const cad = median((market.peers || []).map((p) => p.posts_per_week));
    if (cad != null) items.push({ text: T('Así publica tu rubro en tu zona', 'This is how your category posts in your area'), now: T('la mediana es ' + fmtRate(cad) + ' posteos por semana', 'the median is ' + fmtRate(cad, 'en') + ' posts per week') });
  }
  return items.length ? { items, locked: true, note: T('Esto es una probada: el mapa completo de tu competencia, tu posición y las decisiones que tomamos con eso viven en tu vista Análisis.', 'This is a taste: the full map of your competition, your position and the decisions we make with it live in your Analysis view.') } : null;
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
const HIGHLIGHT_NAMES_EN = {
  estrella: 'The star', catalogo: 'Catalog', promos: 'Deals', opiniones: 'Reviews',
  'como-comprar': 'How to buy', nosotros: 'About us',
};

function profileKit({ business = {}, digest = null, reviews = null, lang }) {
  const en = lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const d = digest || {};
  const firstOffering = (d.productos && d.productos[0]) || (d.servicios && d.servicios[0]) || null;
  const star = (d.inferred_star && d.inferred_star.item) || (firstOffering && (firstOffering.nombre || firstOffering)) || null;
  const lines = [];
  if (star) lines.push('⭐ ' + String(star).slice(0, 42));
  else if (business.category) lines.push('✨ ' + String(business.category).slice(0, 42));
  if (d.diferencial) lines.push('💛 ' + String(d.diferencial).slice(0, 42));
  if (reviews && reviews.rating) lines.push('⭐ ' + fmtRate(reviews.rating, lang) + T(' en Google', ' on Google') + (reviews.total ? ' (' + reviews.total + T(' reseñas)', ' reviews)') : ''));
  if (business.city || d.ciudad) lines.push('📍 ' + String(business.city || d.ciudad).slice(0, 30));
  lines.push(T('👇 Tu semana de posteos, acá', '👇 Your week of posts, right here'));
  const bio = lines.slice(0, 4).join('\n').slice(0, 150);
  const highlights = HIGHLIGHT_SETS.filter((h) => {
    if (h.key === 'promos') return Array.isArray(d.promos) && d.promos.length > 0;
    if (h.key === 'opiniones') return !!(reviews && reviews.total > 0);
    if (h.key === 'catalogo') return (d.productos || []).length + (d.servicios || []).length > 0;
    return true;
  }).map((h) => (en ? (HIGHLIGHT_NAMES_EN[h.key] || h.name) : h.name));
  return {
    display_name: String(business.name || '').slice(0, 30),
    username: business.ig_username ? '@' + String(business.ig_username).replace(/^@/, '') : null,
    category_label: business.category || null,
    bio_lines: lines.slice(0, 4),
    bio,
    photo: T('la foto de perfil sale de tu logo o de tu producto estrella, con la paleta de tu marca', 'your profile photo comes from your logo or your star product, in your brand palette'),
    highlights,
    note: T('Kit armado desde tu web, tu fundamento y tus reseñas reales: nada se afirma sin una fuente tuya detrás.', 'Kit built from your website, your foundation and your real reviews: nothing is claimed without one of your own sources behind it.'),
  };
}

function starterGrid({ digest = null, market = null, reviews = null, lang }) {
  const en = lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const d = digest || {};
  const hasPromo = Array.isArray(d.promos) && d.promos.length > 0;
  const hasReviews = !!(reviews && reviews.total > 0);
  const S = (slot, role, format, intent, why) => ({ slot, role, format, intent, why });
  const grid = [
    S(1, T('El gancho', 'The hook'), 'post', 'vender', T('Tu producto estrella abre la vidriera: es lo primero que un cliente nuevo tiene que ver.', 'Your star product opens the storefront: it is the first thing a new customer has to see.')),
    S(2, T('El estrella de cerca', 'The star, up close'), 'post', 'vender', T('El detalle de lo que mejor hacés, mostrado como se merece.', 'The detail of what you do best, shown the way it deserves.')),
    S(3, T('Detrás de escena', 'Behind the scenes'), 'reel', 'autoridad', T('Cómo se hace lo tuyo: el proceso real genera confianza más que cualquier placa.', 'How yours gets made: the real process builds more trust than any graphic.')),
    S(4, T('Tu historia', 'Your story'), 'post', 'autoridad', T('Quiénes están detrás del negocio: la gente conecta con personas, no con logos.', 'Who is behind the business: people connect with people, not with logos.')),
    S(5, T('El educativo', 'The educational one'), 'carrusel', 'consultas', T('Un consejo útil de tu rubro te posiciona como el que sabe — y trae preguntas reales.', 'A useful tip from your trade positions you as the one who knows — and brings real questions.')),
    hasPromo
      ? S(6, T('La oferta real', 'The real offer'), 'post', 'vender', T('Tu promo vigente, con precio y condiciones reales: la vidriera también vende.', 'Your live promo, with its real price and terms: the storefront sells too.'))
      : S(6, T('El servicio clave', 'The key service'), 'post', 'consultas', T('El servicio que más te piden, explicado simple: baja las preguntas repetidas.', 'The service people ask you for most, explained simply: it cuts the repeated questions.')),
    S(7, T('La pregunta', 'The question'), 'post', 'consultas', T('Una pregunta a tu comunidad: los primeros comentarios valen oro para el algoritmo y para vos.', 'A question to your community: the first comments are gold for the algorithm and for you.')),
    S(8, T('El detalle', 'The detail'), 'post', 'vender', T('Un segundo producto o detalle de tu trabajo: amplitud sin perder foco.', 'A second product or a detail of your work: breadth without losing focus.')),
    hasReviews
      ? S(9, T('La prueba', 'The proof'), 'post', 'prueba', T('Una opinión real de tus clientes cierra la vidriera: lo que otros ya vivieron vende por vos.', 'A real review from your customers closes the storefront: what others already lived sells for you.'))
      : S(9, T('La invitación', 'The invitation'), 'post', 'consultas', T('El cierre de la vidriera invita a escribirte: simple, directo y con tu forma de atender.', 'The storefront closes by inviting people to message you: simple, direct, in your own way of serving.')),
  ];
  if (market && market.available) {
    const cad = median((market.peers || []).map((p) => p.posts_per_week));
    if (cad != null) grid.market_note = T('El ritmo y los formatos de esta vidriera salen de lo que ya funciona en tu rubro y tu zona (mediana: ' + fmtRate(cad) + ' posteos por semana).', 'The rhythm and formats of this storefront come from what already works in your category and your area (median: ' + fmtRate(cad, 'en') + ' posts per week).');
  }
  return grid;
}

function coldFindings({ digest = null, market = null, reviews = null, lang }) {
  const en = lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const d = digest || {};
  const findings = [];
  findings.push({
    key: 'nacimiento', group: 'plan',
    text: T('Tu cuenta nace con estrategia, no desde cero', 'Your account is born with a strategy, not from zero'),
    now: T('no hay historial que corregir: cada posteo sale pensado desde el primero', 'there is no history to fix: every post is thought out from the very first one'),
    with_posty: T('posicionamiento, kit de perfil y tu primera vidriera de 9 piezas', 'positioning, a profile kit and your first 9-piece storefront'),
    evidence: null,
    decision: T('La cuenta nace completa: perfil armado y las primeras 9 piezas como vidriera.', 'The account is born complete: profile set up and the first 9 pieces as its storefront.'),
  });
  const star = (d.inferred_star && d.inferred_star.item) || ((d.productos || [])[0] && ((d.productos[0].nombre || d.productos[0]))) || ((d.servicios || [])[0] && ((d.servicios[0].nombre || d.servicios[0]))) || null;
  if (star) {
    findings.push({
      key: 'estrella', group: 'plan',
      text: T('Tu producto estrella abre la vidriera', 'Your star product opens the storefront'),
      now: String(star),
      with_posty: T('las primeras piezas giran alrededor de lo que mejor vendés', 'the first pieces revolve around what you sell best'),
      evidence: { metric: 'digest_star', value: String(star), source: 'fundamento' },
      decision: T('La vidriera abre con tu producto estrella.', 'The storefront opens with your star product.'),
    });
  }
  if (reviews && reviews.rating) {
    findings.push({
      key: 'resenas', group: 'plan',
      text: T('Ya tenés reputación — ahora se va a ver en Instagram', 'You already have a reputation — now it will show on Instagram'),
      now: fmtRate(reviews.rating, lang) + T(' estrellas en Google', ' stars on Google') + (reviews.total ? T(' con ' + reviews.total + ' reseñas', ' with ' + reviews.total + ' reviews') : ''),
      with_posty: T('esa confianza, también en tu perfil de Instagram', 'that trust, on your Instagram profile too'),
      evidence: { metric: 'google_rating', value: reviews.rating, source: 'google' },
      decision: T('El kit de perfil lleva tu reputación de Google a la bio.', 'The profile kit takes your Google reputation into your bio.'),
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
  const en = ctx.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const postsPerWeek = ctx.postsPerWeek || 7;
  const preds = [
    { key: 'posts_per_week', label: T('posteos por semana', 'posts per week'), target: postsPerWeek, kind: 'objetivo', note: T('la semana completa, sin huecos', 'the full week, no gaps') },
    { key: 'max_gap_days', label: T('racha máxima sin publicar (días)', 'longest stretch without posting (days)'), target: 2, kind: 'objetivo', compare: 'lte', note: T('ninguna racha larga en silencio', 'no long silent stretch') },
  ];
  const hasReelFinding = (analysis.findings || []).some((f) => f.key === 'reels');
  if (hasReelFinding || analysis.kind === 'nacimiento') {
    preds.push({ key: 'videos', label: T('reels en la ventana reciente', 'reels in the recent window'), target: 1, kind: 'objetivo', compare: 'gte', note: T('el formato que más empuja, presente en tu mix', 'the format that pushes the most, present in your mix') });
  }
  return preds;
}

function evaluateLoop(prior, currentSignals) {
  if (!prior || !Array.isArray(prior.predictions) || !prior.predictions.length) return null;
  const en = prior.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const fr = (x) => fmtRate(x, prior.lang);
  const s = currentSignals || {};
  const checks = prior.predictions.map((p) => {
    const actual = s[p.key];
    if (actual == null || !Number.isFinite(actual)) {
      return { key: p.key, label: p.label, target: p.target, actual: null, status: 'sin-datos', text: T('Todavía no hay datos nuevos para medir "' + p.label + '".', 'There is no new data yet to measure "' + p.label + '".') };
    }
    const ok = p.compare === 'lte' ? actual <= p.target : actual >= p.target;
    let improved = null;
    if (prior.signals && prior.signals[p.key] != null && Number.isFinite(prior.signals[p.key])) {
      improved = p.compare === 'lte' ? actual < prior.signals[p.key] : actual > prior.signals[p.key];
    }
    const status = ok ? 'cumplida' : (improved ? 'en-curso' : 'en-curso');
    const text = ok
      ? T('Objetivo cumplido: "' + p.label + '" llegó a ' + fr(actual) + ' (la meta era ' + fr(p.target) + ').', 'Goal met: "' + p.label + '" reached ' + fr(actual) + ' (the target was ' + fr(p.target) + ').')
      : T('Vamos en camino: "' + p.label + '" está en ' + fr(actual) + ' y la meta es ' + fr(p.target) + ' — la semana que viene sigue empujando ahí.', 'We are on our way: "' + p.label + '" is at ' + fr(actual) + ' and the target is ' + fr(p.target) + ' — next week keeps pushing there.');
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
const INTENT_WHY_EN = {
  vender: 'Because it is built to sell',
  reservar: 'Because it is built to get you bookings',
  consultas: 'Because it is built to bring you inquiries',
  prueba: 'Because it shows real proof of your work',
  autoridad: 'Because it positions you as the one who knows your trade',
};
const FINDING_FOR_FORMAT = { reel: 'reels', video: 'reels' };
const FINDING_FOR_TIPO = { promo: 'estrella', novedad: 'estrella' };

function whyForPost(post, analysis, digest) {
  if (!post || typeof post !== 'object') return null;
  const en = !!(analysis && analysis.lang === 'en');
  const T = (es, enS) => (en ? enS : es);
  const INTENT = en ? INTENT_WHY_EN : INTENT_WHY;
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
  if (anchor) candidates.push(T('Porque muestra ' + String(anchor) + ', uno de los fuertes de tu negocio, con tu línea visual.', 'Because it shows ' + String(anchor) + ', one of your business strengths, in your visual line.'));
  const intent = String(post.salesIntent || post.intent || post.intencion || '').toLowerCase();
  if (INTENT[intent]) candidates.push(INTENT[intent] + T(': sale en tu mejor franja y con un gancho que frena el scroll.', ': it goes out in your best time band with a hook that stops the scroll.'));
  candidates.push(T('Porque forma parte de una semana pensada como un todo: cada pieza cumple un rol distinto en tu grilla.', 'Because it is part of a week designed as a whole: every piece plays a different role on your grid.'));

  for (const c of candidates) {
    const line = String(c || '').trim().replace(/\s+/g, ' ');
    if (!line) continue;
    if (!lintTone(line, analysis && analysis.lang).ok) continue;
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
  const en = analysis.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  const findings = (analysis.findings || []).filter((f) => f && f.decision);
  if (!findings.length) return null;
  const top = findings.slice(0, 2);
  const seen = top.map((f) => {
    const claim = f.now ? (f.text.charAt(0).toLowerCase() + f.text.slice(1) + ' (' + f.now + ')') : (f.text.charAt(0).toLowerCase() + f.text.slice(1));
    return claim;
  }).join(T('. También ', '. Also '));
  const decided = top.map((f) => f.decision.charAt(0).toLowerCase() + f.decision.slice(1)).join(' ');
  const lines = [
    T('Esta semana miré tu cuenta y vi que ' + seen + '.', 'This week I looked at your account and saw that ' + seen + '.'),
    T('Por eso tu semana es así: ' + decided, "That's why your week looks like this: " + decided),
  ];
  if (analysis.kind === 'nacimiento') {
    lines[0] = T('Tu cuenta recién arranca, así que armé el plan desde tu rubro, tu zona y lo mejor de tu negocio.', 'Your account is just starting, so I built the plan from your category, your area and the best of your business.');
    lines[1] = T('Por eso tu semana es así: ' + decided, "That's why your week looks like this: " + decided);
  }
  const out = lines.join('\n');
  return lintTone(out, analysis.lang).ok ? out : lines[0];
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
    // (v274) El idioma viaja DENTRO del análisis: whyForPost/weekSummary y
    // el loop lo leen de acá sin necesidad de ctx en cada llamada.
    lang: ctx.lang === 'en' ? 'en' : 'es',
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
    a.data_notes.push(ctx.lang === 'en' ? 'Connected account: posting times are fine-tuned with your real metrics.' : 'Cuenta conectada: los horarios se afinan con tus métricas reales.');
    a.insights = { best_hour: ctx.insights.bestHour };
  } else {
    a.data_notes.push(ctx.lang === 'en' ? 'Analysis from your public profile data; once you connect your account it gets more precise with your real metrics.' : 'Análisis con datos públicos de tu perfil; al conectar tu cuenta se vuelve más preciso con tus métricas reales.');
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
  a.findings = coldFindings({ digest, market: a.market, reviews, lang: ctx.lang });
  a.profile_kit = profileKit({ business, digest, reviews, lang: ctx.lang });
  a.starter_grid = starterGrid({ digest, market: a.market, reviews, lang: ctx.lang });
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
  const full = planId === 'pro' || planId === 'total' || planId === 'free';
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
