// study-competitors.js — ESTUDIO-PROFUNDO · MEJORA 5: COMPETENCIA (7/11).
//
// SOLO la pieza del estudio: 3-5 cuentas del MISMO rubro y MISMA ciudad que
// el cliente, con sus tipos de posteo y temas extraídos; el hueco (lo que
// nadie de la competencia hace y el cliente podría hacer) es la oportunidad.
// Todo vive en el fundamento bajo su propio espacio de nombres:
//   fundamento.competitors = { version, status, studied_at, rubro, ciudad,
//     competitors[], other_city[], discovered_not_analyzed[], gap, notes }
// El bloque NO entra en el hash de anclas (digestHashOf solo cubre
// productos/servicios/promos/temas/protagonista/ciudad/diferencial) y el
// refresco semanal lo preserva por copia base (applyDeepBlocks).
//
// CÓMO SE DESCUBREN LOS COMPETIDORES (solo medios ya disponibles, sin flujo
// de credenciales nuevo, sin inventar cuentas):
//   1. Campo `competitors` del perfil — los @ que el propio cliente (o el
//      formulario de la prueba) ya declaró. Es la fuente principal y la
//      única con @ garantizado. Los pares ya leídos en la prueba
//      (fetchPeersForAnalysis) se reutilizan sin re-bajar (preFetchedPeers).
//   2. @menciones en la bio y los captions del propio cliente — cuentas que
//      él mismo nombra. Se excluye su propio @ y se deduplica.
//   3. Google Places Text Search "<rubro> en <ciudad>" — SOLO si ya existe
//      GOOGLE_PLACES_KEY (misma key y mismo endpoint que google-places.js;
//      ningún flujo nuevo). Places devuelve nombre + dirección, NO @ de IG:
//      esos negocios quedan en `discovered_not_analyzed` (analyzed:false,
//      reason:'sin_handle_ig') — descubiertos, no analizados, nunca con
//      un handle adivinado a partir del nombre.
// NO hay búsqueda web ni búsqueda de IG en el servidor (no existe ese medio
// sin sesión): si el descubrimiento es limitado, la rama honesta manda —
// status 'sin_competidores', listas vacías, gap null, nota documentada.
//
// CIUDAD (nunca se infiere a la ligera): el rubro y la ciudad salen del
// fundamento del cliente (digest.ciudad / rubro confirmado). Un candidato
// es LOCAL solo con evidencia de ciudad:
//   'same'  — su bio/captions/dirección menciona la ciudad del cliente, o
//             el llamador aporta cityHint {match:'same'} (p. ej. Places).
//   'other' — trae una ubicación explícita distinta: pin 📍 con otra
//             localidad, o dirección de Places fuera de la ciudad.
//   'unknown' — sin evidencia de ciudad en ningún lado.
// Solo 'same' entra en `competitors` (máx. 5). 'other' y 'unknown' van a
// `other_city` marcados distinto: mismo rubro pero no locales, jamás
// contados como competencia local ni usados para el hueco.
//
// HUECO (determinístico, USD 0, sin IA): solo con >= 2 locales analizados.
//   1. tema — un tema del cliente (digest.temas_feed) que ningún local
//      cubre (comparación normalizada, con subcadena: #cafe cubre
//      «café de especialidad»);
//   2. formato — reels si el share pooled de video de los locales < 15%,
//      si no carruseles si su share pooled < 15%.
//   Con menos de 2 locales, o con todo cubierto: gap null, sin inventar.
//
// CONTRATO PARA EL LOTE SEMANAL DE TENDENCIAS (reutiliza sin re-estudiar):
//   fundamento.competitors.competitors[i] = { handle, name, bio_head,
//     followers, posts_count, posts_analyzed, city_match, city_evidence,
//     source, discovered_via, post_types { images, videos, carousels,
//     total, video_share, carousel_share }, posts_per_week,
//     topics [{ topic, count, source }], analyzed_at }
//   fundamento.competitors.gap = null | { kind: 'tema'|'formato',
//     label_es, label_en, detail_es, detail_en, opportunity_es,
//     opportunity_en, evidence { competitor_handles, metric, value,
//     pooled_posts, client_value } }
//   fundamento.competitors.discovered_not_analyzed[i] = { name, address,
//     city_match, city_evidence, source: 'places', analyzed: false,
//     reason: 'sin_handle_ig' }
// La semana de tendencias lee de acá: qué hacen los locales (post_types +
// topics por cuenta) y dónde está el hueco (gap) — misma fuente, misma
// forma. Si status != 'ok', no hay datos de competencia que reutilizar.
//
// Nunca lanza: studyCompetitors y searchPlacesBusinesses devuelven el
// bloque / resultado honesto ante cualquier fallo. La prueba nunca espera
// de más por esto: el llamador corre con carrera (ver server.js).
'use strict';

const MAX_COMPETITORS = 5;
const COMPETITORS_VERSION = 1;
const PEER_FETCH_TIMEOUT_MS = 3500;
const PLACES_TIMEOUT_MS = 8000;
const MIN_LOCALS_FOR_GAP = 2;
const FORMAT_GAP_SHARE = 0.15;

// ---------------------------------------------------------------------------
// Normalización y ciudad
// ---------------------------------------------------------------------------
function normalizeCity(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function normTopic(s) {
  return normalizeCity(s).replace(/[^a-z0-9]/g, '');
}
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ¿El texto menciona la ciudad (palabra completa, no subcadena casual)?
function cityMatchesText(text, city) {
  const c = normalizeCity(city);
  if (!c) return false;
  const t = ' ' + normalizeCity(text) + ' ';
  return new RegExp('[^a-z0-9]' + escRe(c) + '[^a-z0-9]').test(t);
}

// Pin 📍 de ubicación en la bio («📍 Rosario, Santa Fe»): la localidad que
// el propio negocio declara. null si no hay pin.
function locationPin(text) {
  const m = /📍\s*([^,\n|]{2,60})/.exec(String(text || ''));
  if (!m) return null;
  const v = m[1].trim().replace(/\s+/g, ' ');
  return v || null;
}

// Clasifica la ciudad de un candidato desde sus textos (bio + captions) o
// desde un cityHint aportado por el llamador (p. ej. dirección de Places,
// dato estructurado). Devuelve { match: 'same'|'other'|'unknown', evidence }.
function classifyCity({ bio, captions, city, cityHint }) {
  if (cityHint && (cityHint.match === 'same' || cityHint.match === 'other')) {
    return { match: cityHint.match, evidence: String(cityHint.evidence || '').slice(0, 120) };
  }
  const text = [bio || '', ...(Array.isArray(captions) ? captions : [])].join(' ');
  if (cityMatchesText(text, city)) {
    return { match: 'same', evidence: 'menciona ' + String(city).trim() };
  }
  const pin = locationPin(bio || '');
  if (pin) {
    const pinNorm = normalizeCity(pin);
    const cityNorm = normalizeCity(city);
    if (pinNorm === cityNorm || pinNorm.indexOf(cityNorm) >= 0 || cityNorm.indexOf(pinNorm) >= 0) {
      return { match: 'same', evidence: '📍 ' + pin };
    }
    return { match: 'other', evidence: pin };
  }
  return { match: 'unknown', evidence: '' };
}

// ---------------------------------------------------------------------------
// Handles: campo competitors + menciones del propio cliente
// ---------------------------------------------------------------------------
function sanitizeHandle(h) {
  return String(h || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 40);
}

// Mismo parser que peerHandlesFromText de server.js (el campo competitors es
// una lista de @): cualquier token de 3+ caracteres vale; se excluyen el
// propio @ y los tokens de URL. Sin ese campo no hay candidatos de acá.
function parseCompetitorHandles(text, ownHandle, max) {
  const out = [];
  const own = sanitizeHandle(ownHandle).toLowerCase();
  const re = /@?([a-zA-Z0-9._]{3,40})/g;
  let m;
  while ((m = re.exec(String(text || ''))) && out.length < (max || MAX_COMPETITORS * 2)) {
    const h = sanitizeHandle(m[1]).toLowerCase();
    if (!h || h.length < 3) continue;
    if (/^(www|com|ar|http|https)$/i.test(h)) continue;
    if (own && h === own) continue;
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

// @menciones literales en los textos del cliente (bio + captions): solo
// tokens con @ explícita — un texto sin @ no inventa un competidor.
function extractMentionedHandles(a, b, ownHandle) {
  const texts = [];
  const push = (x) => {
    if (Array.isArray(x)) x.forEach((t) => { if (t) texts.push(String(t)); });
    else if (x) texts.push(String(x));
  };
  push(a); push(b);
  const own = sanitizeHandle(ownHandle).toLowerCase();
  const out = [];
  const re = /@([a-zA-Z0-9._]{3,40})/g;
  for (const t of texts) {
    let m;
    while ((m = re.exec(t))) {
      const h = sanitizeHandle(m[1]).toLowerCase();
      if (!h || h.length < 3) continue;
      if (own && h === own) continue;
      if (!out.includes(h)) out.push(h);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Temas y tipos de posteo (determinístico, desde captions reales)
// ---------------------------------------------------------------------------
const STOPWORDS = new Set(('de la el en y los las con para por un una del se su que es este esta esto hoy dia nuevo nueva nuestro nuestra nos ya al lo como mas muy sin sobre entre cuando todo todos fue son hay the and for with you your our this that from are was were has have had not but they them then than into over under after before about their there here what when where which while quien como donde cuando porque gracias visita vení venite mirá miren dejá contanos').split(/\s+/));

function extractTopicsFromCaptions(captions, max) {
  const counts = new Map(); // norm -> { topic, count, source }
  const caps = (Array.isArray(captions) ? captions : []).map((c) => String(c || '')).filter(Boolean);
  for (const c of caps) {
    for (const m of c.match(/#[\p{L}0-9_]+/gu) || []) {
      const k = normTopic(m.slice(1));
      if (k.length < 3 || k.length > 30) continue;
      const e = counts.get(k) || { topic: m.slice(1).toLowerCase(), count: 0, source: 'hashtags' };
      e.count++;
      counts.set(k, e);
    }
  }
  const words = new Map();
  for (const c of caps) {
    const seen = new Set();
    for (const w of normalizeCity(c).split(' ')) {
      if (w.length < 4 || STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      words.set(w, (words.get(w) || 0) + 1);
    }
  }
  for (const [w, n] of words) {
    if (n < 2) continue;
    if (counts.has(w)) continue;
    counts.set(w, { topic: w, count: n, source: 'palabras' });
  }
  return Array.from(counts.values())
    .sort((a, b) => (b.count - a.count) || (a.topic < b.topic ? -1 : 1))
    .slice(0, max || 8);
}

function postTypeOf(p) {
  const t = String((p && p.type) || (p && p.tipo) || '');
  if (t === 'GraphVideo' || t === 'video' || t === 'reel') return 'videos';
  if (t === 'GraphSidecar' || t === 'carousel' || t === 'carrusel') return 'carousels';
  if (t === 'GraphImage' || t === 'image' || t === 'imagen') return 'images';
  return null;
}

function summarizePosts(posts) {
  const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object');
  const counts = { images: 0, videos: 0, carousels: 0 };
  list.forEach((p) => { const k = postTypeOf(p); if (k) counts[k]++; });
  const total = counts.images + counts.videos + counts.carousels;
  let postsPerWeek = null;
  const ts = list.map((p) => p.taken_at).filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
  if (ts.length >= 2) {
    const spanDays = Math.max(7, (ts[ts.length - 1] - ts[0]) / 86400);
    postsPerWeek = Math.round((ts.length / (spanDays / 7)) * 10) / 10;
  }
  const captions = list.map((p) => String(p.caption || '')).filter(Boolean);
  return {
    total,
    images: counts.images,
    videos: counts.videos,
    carousels: counts.carousels,
    video_share: total ? Math.round((counts.videos / total) * 100) / 100 : 0,
    carousel_share: total ? Math.round((counts.carousels / total) * 100) / 100 : 0,
    posts_per_week: postsPerWeek,
    topics: extractTopicsFromCaptions(captions),
    captions_n: captions.length,
  };
}

// ---------------------------------------------------------------------------
// Perfil de un competidor desde sus datos públicos leídos
// ---------------------------------------------------------------------------
// auditData: forma de feedAudit.fetchAuditData ({ ok, profile, posts }) o
// forma de par ya leído ({ handle, followers, posts }) — ambas traen los
// posteos públicos con tipo + caption. Sin datos, null (nunca inventado).
function profileCompetitor({ handle, auditData, city, source, discoveredVia, cityHint }) {
  const h = sanitizeHandle(handle).toLowerCase();
  if (!h || !auditData) return null;
  const posts = Array.isArray(auditData.posts) ? auditData.posts : null;
  if (!posts) return null;
  const prof = (auditData.profile && typeof auditData.profile === 'object') ? auditData.profile : {};
  const bio = String(prof.bio || '');
  const captions = posts.map((p) => String((p && p.caption) || '')).filter(Boolean);
  const cls = classifyCity({ bio, captions, city, cityHint });
  const sum = summarizePosts(posts);
  return {
    handle: h,
    name: String(prof.name || '').slice(0, 80),
    bio_head: bio.slice(0, 120),
    followers: (typeof prof.followers === 'number' ? prof.followers : (typeof auditData.followers === 'number' ? auditData.followers : null)),
    posts_count: (typeof prof.posts_count === 'number' ? prof.posts_count : posts.length),
    posts_analyzed: sum.total,
    city_match: cls.match,
    city_evidence: cls.evidence,
    source: source || 'competitors_field',
    discovered_via: discoveredVia || '',
    post_types: {
      images: sum.images, videos: sum.videos, carousels: sum.carousels,
      total: sum.total, video_share: sum.video_share, carousel_share: sum.carousel_share,
    },
    posts_per_week: sum.posts_per_week,
    topics: sum.topics,
    analyzed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hueco: lo que nadie de la competencia local hace y el cliente podría hacer
// ---------------------------------------------------------------------------
function topicCovered(clientTopic, locals) {
  const ct = normTopic(clientTopic);
  if (!ct || ct.length < 3) return true; // tema vacío o ruido: no es hueco
  for (const l of locals || []) {
    for (const t of (l.topics || [])) {
      const lt = normTopic(t.topic || t);
      if (!lt) continue;
      if (lt === ct || ct.indexOf(lt) >= 0 || lt.indexOf(ct) >= 0) return true;
    }
  }
  return false;
}

function findGap({ clientTopics, clientPostTypes, locals }) {
  const list = (Array.isArray(locals) ? locals : []).filter((l) => l && l.post_types && l.post_types.total > 0);
  if (list.length < MIN_LOCALS_FOR_GAP) return null;
  const pooled = list.reduce((a, l) => a + l.post_types.total, 0);
  if (pooled < 6) return null;
  const handles = list.map((l) => l.handle);
  const clientValue = (clientPostTypes && typeof clientPostTypes.video_share === 'number') ? clientPostTypes.video_share : null;

  // 1. Tema del cliente que ningún local cubre.
  const topics = (Array.isArray(clientTopics) ? clientTopics : []).map((t) => String((t && t.nombre) || t || '').trim()).filter(Boolean);
  for (const tp of topics) {
    if (!topicCovered(tp, list)) {
      return {
        kind: 'tema',
        label_es: 'Tema sin competencia: ' + tp,
        label_en: 'Uncontested topic: ' + tp,
        detail_es: 'Ninguno de tus ' + list.length + ' competidores locales habla de ' + tp + ' en sus posteos. Es un tema tuyo que la competencia no está ocupando.',
        detail_en: 'None of your ' + list.length + ' local competitors talk about ' + tp + ' in their posts. It is your topic, and the competition is not covering it.',
        opportunity_es: 'Hacé de ' + tp + ' tu tema propio de la semana: posteos que solo vos podés hacer.',
        opportunity_en: 'Make ' + tp + ' your own topic of the week: posts only you can make.',
        evidence: { competitor_handles: handles, metric: 'topic_coverage', value: 0, pooled_posts: pooled, topic: tp, client_value: clientValue },
      };
    }
  }
  // 2. Formato: reels primero, carruseles después (share pooled < 15%).
  const pooledVideos = list.reduce((a, l) => a + (l.post_types.videos || 0), 0);
  const videoShare = pooledVideos / pooled;
  if (videoShare < FORMAT_GAP_SHARE) {
    const pct = Math.round(videoShare * 100);
    return {
      kind: 'formato',
      label_es: 'Reels: casi nadie de tu competencia los hace',
      label_en: 'Reels: almost none of your competitors make them',
      detail_es: 'De ' + pooled + ' posteos de tus ' + list.length + ' competidores locales, solo ' + pooledVideos + ' son reels (' + pct + '%). El formato que más empuja Instagram está casi vacío en tu rubro y tu ciudad.',
      detail_en: 'Of ' + pooled + ' posts from your ' + list.length + ' local competitors, only ' + pooledVideos + ' are reels (' + pct + '%). The format Instagram pushes the most is almost empty in your niche and city.',
      opportunity_es: 'Un reel por semana con tu producto real te pone donde tu competencia no está.',
      opportunity_en: 'One reel a week with your real product puts you where your competitors are not.',
      evidence: { competitor_handles: handles, metric: 'pooled_video_share', value: Math.round(videoShare * 100) / 100, pooled_posts: pooled, client_value: clientValue },
    };
  }
  const pooledCar = list.reduce((a, l) => a + (l.post_types.carousels || 0), 0);
  const carShare = pooledCar / pooled;
  if (carShare < FORMAT_GAP_SHARE) {
    const pct = Math.round(carShare * 100);
    return {
      kind: 'formato',
      label_es: 'Carruseles: casi nadie de tu competencia los hace',
      label_en: 'Carousels: almost none of your competitors make them',
      detail_es: 'De ' + pooled + ' posteos de tus ' + list.length + ' competidores locales, solo ' + pooledCar + ' son carruseles (' + pct + '%).',
      detail_en: 'Of ' + pooled + ' posts from your ' + list.length + ' local competitors, only ' + pooledCar + ' are carousels (' + pct + '%).',
      opportunity_es: 'Un carrusel por semana muestra tu producto en detalle donde tu competencia muestra una sola foto.',
      opportunity_en: 'One carousel a week shows your product in detail where your competitors show a single photo.',
      evidence: { competitor_handles: handles, metric: 'pooled_carousel_share', value: Math.round(carShare * 100) / 100, pooled_posts: pooled, client_value: clientValue },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Google Places: negocios del rubro en la ciudad (sin @ de IG)
// ---------------------------------------------------------------------------
// Misma key y mismo endpoint que google-places.js (Text Search). Sin key,
// { available:false } — nunca se inventa un negocio ni se pide credencial.
// fetchImpl inyectable para tests. Nunca lanza.
async function searchPlacesBusinesses({ rubroLabel, city, fetchImpl } = {}) {
  const key = String(process.env.GOOGLE_PLACES_KEY || '').trim();
  const label = String(rubroLabel || '').trim();
  const c = String(city || '').trim();
  if (!key) return { available: false, reason: 'sin_GOOGLE_PLACES_KEY', results: [] };
  if (!label || !c) return { available: false, reason: 'sin_rubro_o_ciudad', results: [] };
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, PLACES_TIMEOUT_MS);
  try {
    const q = label + ' en ' + c;
    const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json' +
      '?query=' + encodeURIComponent(q) + '&language=es&key=' + encodeURIComponent(key);
    const doFetch = fetchImpl || ((u, o) => fetch(u, o));
    const res = await doFetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PostyBot/1.0)', Accept: 'application/json' } });
    const d = await res.json();
    if (!d || d.status !== 'OK') return { available: true, reason: 'places_' + String((d && d.status) || 'error'), results: [] };
    const results = (Array.isArray(d.results) ? d.results : []).slice(0, MAX_COMPETITORS).map((r) => {
      const addr = String((r && r.formatted_address) || '');
      const same = cityMatchesText(addr, c);
      return {
        name: String((r && r.name) || '').slice(0, 80),
        address: addr.slice(0, 160),
        city_match: same ? 'same' : 'other',
        city_evidence: addr.slice(0, 160),
        source: 'places',
      };
    }).filter((r) => r.name);
    return { available: true, reason: '', results };
  } catch (e) {
    return { available: false, reason: 'places_error', results: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Orquestador: estudia la competencia del cliente en el momento del estudio
// ---------------------------------------------------------------------------
function emptyBlock(rubro, ciudad, status, notes) {
  return {
    version: COMPETITORS_VERSION, status,
    studied_at: new Date().toISOString(),
    rubro: rubro || '', ciudad: ciudad || '', ciudad_source: '',
    competitors: [], other_city: [], discovered_not_analyzed: [],
    gap: null, notes: notes || [],
  };
}

async function studyCompetitors(opts = {}) {
  const rubro = String(opts.rubro || '').trim().slice(0, 40);
  const ciudad = String(opts.ciudad || '').trim().slice(0, 60);
  const clientHandle = sanitizeHandle(opts.clientHandle || '');
  if (!rubro) {
    return emptyBlock('', ciudad, 'sin_rubro',
      ['sin rubro confirmado en el fundamento: la competencia no se estudia ni se infiere el rubro']);
  }
  if (!ciudad) {
    return emptyBlock(rubro, '', 'sin_ciudad',
      ['sin ciudad en el fundamento: la competencia no se estudia ni se infiere la ciudad']);
  }
  const block = emptyBlock(rubro, ciudad, 'sin_competidores', []);
  block.ciudad_source = String(opts.ciudadSource || '');

  const fetchAuditData = (typeof opts.fetchAuditData === 'function') ? opts.fetchAuditData : null;
  const peersByHandle = new Map();
  (Array.isArray(opts.preFetchedPeers) ? opts.preFetchedPeers : []).forEach((p) => {
    const h = sanitizeHandle(p && p.handle).toLowerCase();
    if (h && !peersByHandle.has(h)) peersByHandle.set(h, p);
  });

  // Candidatos: primero el campo competitors, después las menciones del
  // propio cliente. Deduplicados, sin el propio @, con tope de lectura.
  const fieldHandles = parseCompetitorHandles(opts.competitorsField, clientHandle, MAX_COMPETITORS * 2);
  const mentionHandles = extractMentionedHandles(opts.clientBio, opts.clientCaptions, clientHandle);
  const ordered = [];
  const seen = new Set();
  const note = (h, source, via) => ({ handle: h, source, discovered_via: via });
  fieldHandles.forEach((h) => { if (!seen.has(h)) { seen.add(h); ordered.push(note(h, 'competitors_field', 'campo competitors del perfil')); } });
  mentionHandles.forEach((h) => { if (!seen.has(h)) { seen.add(h); ordered.push(note(h, 'client_mention', 'mención en bio/captions del cliente')); } });
  const toRead = ordered.slice(0, MAX_COMPETITORS * 2);

  // Lectura en paralelo con carrera por cuenta (mismo patrón que los pares
  // del análisis): una cuenta sin datos no frena a las demás.
  const readOne = async (cand) => {
    try {
      const peer = peersByHandle.get(cand.handle);
      if (peer) {
        return profileCompetitor({
          handle: cand.handle, auditData: peer, city: ciudad,
          source: cand.source, discoveredVia: 'par ya leído en la prueba (sin re-fetch)',
        });
      }
      if (!fetchAuditData) return null;
      const data = await Promise.race([
        fetchAuditData(cand.handle),
        new Promise((r) => setTimeout(() => r(null), PEER_FETCH_TIMEOUT_MS)),
      ]);
      if (!data || data.ok === false) {
        if (data === null) block.notes.push('sin_datos: @' + cand.handle + ' no se pudo leer (no se inventa)');
        return null;
      }
      return profileCompetitor({
        handle: cand.handle, auditData: data, city: ciudad,
        source: cand.source, discoveredVia: cand.discovered_via,
      });
    } catch (e) { return null; }
  };
  let profiles = [];
  try { profiles = (await Promise.all(toRead.map(readOne))).filter(Boolean); }
  catch (e) { profiles = []; }

  const locals = [];
  const otherCity = [];
  for (const p of profiles) {
    if (p.city_match === 'same') locals.push(p);
    else otherCity.push(p);
  }
  block.competitors = locals.slice(0, MAX_COMPETITORS);
  if (locals.length > MAX_COMPETITORS) {
    block.notes.push('tope_5_locales: ' + locals.length + ' locales descubiertos, se guardan 5');
    otherCity.unshift(...locals.slice(MAX_COMPETITORS).map((p) => ({ ...p, city_match: p.city_match })));
  }
  block.other_city = otherCity;

  // Places: negocios del rubro en la ciudad, sin @ → descubiertos, no
  // analizados. Solo misma ciudad; los de otra ciudad ni se listan.
  try {
    const searchFn = (typeof opts.searchPlacesFn === 'function')
      ? opts.searchPlacesFn
      : (() => searchPlacesBusinesses({ rubroLabel: rubro, city: ciudad }));
    const found = await searchFn();
    const res = (found && Array.isArray(found.results)) ? found.results : [];
    block.discovered_not_analyzed = res
      .filter((r) => r && r.city_match === 'same' && r.name)
      .slice(0, MAX_COMPETITORS)
      .map((r) => ({
        name: String(r.name).slice(0, 80),
        address: String(r.address || '').slice(0, 160),
        city_match: 'same',
        city_evidence: String(r.city_evidence || r.address || '').slice(0, 160),
        source: 'places',
        analyzed: false,
        reason: 'sin_handle_ig',
      }));
    if (found && found.available === false) {
      block.notes.push('places_no_disponible: ' + String(found.reason || 'sin buscador') + ' — solo se estudian los @ declarados o mencionados');
    }
  } catch (e) {
    block.notes.push('places_error: no se pudo buscar en Places — solo se estudian los @ declarados o mencionados');
  }

  // Hueco desde los locales (y los temas del cliente, del fundamento).
  const clientPostTypes = (opts.clientPostTypes && typeof opts.clientPostTypes === 'object')
    ? opts.clientPostTypes
    : summarizePosts(opts.clientPosts || []);
  block.gap = findGap({ clientTopics: opts.clientTopics || [], clientPostTypes, locals: block.competitors });

  if (block.competitors.length) {
    block.status = 'ok';
  } else {
    block.status = 'sin_competidores';
    block.notes.push('sin competidores descubribles por los medios disponibles (@ declarados, menciones del cliente, Places): lista vacía documentada, nada inventado');
  }
  return block;
}

// ---------------------------------------------------------------------------
// Anclaje al fundamento: espacio de nombres propio, sin reescribir nada
// ---------------------------------------------------------------------------
function attachCompetitorsToDigest(digest, block) {
  if (!digest || typeof digest !== 'object') return digest;
  digest.competitors = block || null;
  return digest;
}

module.exports = {
  MAX_COMPETITORS,
  COMPETITORS_VERSION,
  normalizeCity,
  cityMatchesText,
  parseCompetitorHandles,
  extractMentionedHandles,
  extractTopicsFromCaptions,
  summarizePosts,
  profileCompetitor,
  findGap,
  searchPlacesBusinesses,
  studyCompetitors,
  attachCompetitorsToDigest,
};
