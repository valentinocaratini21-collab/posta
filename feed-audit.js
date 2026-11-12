// feed-audit.js — Auditoría IA del feed público de Instagram (lead magnet).
//
// Página pública /auditoria: el visitante escribe su @ → Posty analiza su
// feed público (bio, últimos posteos, captions, frecuencia, paleta) y devuelve
// un reporte con score, dimensiones y arreglos concretos con evidencia.
// El CTA lleva a /prueba?ig=@handle con el handle pre-rellenado.
//
// Contrato: NUNCA lanza. auditFeed devuelve {ok:true, audit, cached} o
// {ok:false, error}. Todo best-effort: si un dato no está disponible, la
// dimensión se marca "sin datos" en vez de inventarse.
//
// Exporta: { auditFeed, getCachedAudit, consumeAuditAttempt, refundAuditAttempt,
//   sanitizeHandle, computeSignals, buildAuditPrompt, validateAudit, CLICHES }
'use strict';

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const db = require('./db');
const demo = require('./demo');

const AUDIT_MODEL = 'gpt-4o-mini';
const AUDIT_CACHE_HOURS = 72;
const AUDIT_LIMIT_PER_DAY = 5; // auditorías por día por IP
// (LOTE FEED) El embed trae la grilla entera; el tope de 12 dejaba
// fuera los posteos viejos subidos a mano (y la reconciliación los
// marcaba parciales). 100 cubre grillas reales; capPostsToGrid sigue
// recortando a posts_count. El snapshot es 24 h en segundo plano.
const MAX_POSTS = 100;
const MAX_THUMBS = 4;

// ---------------------------------------------------------------------------
// Tablas (idempotentes)
// ---------------------------------------------------------------------------
try { db.exec(`CREATE TABLE IF NOT EXISTS audit_cache (
  handle TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL
)`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS audit_usage (
  ip TEXT, day TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (ip, day)
)`); } catch (e) {}

// ---------------------------------------------------------------------------
// Anti-spam honesto: 5 auditorías por día por IP (mismo patrón que /prueba).
// Se RESERVA al arrancar y se REEMBOLSA si falla.
// ---------------------------------------------------------------------------
function auditDayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function consumeAuditAttempt(ip) {
  const day = auditDayStr();
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM audit_usage WHERE day < date('now', '-7 days')`);
  } catch (_) {}
  try {
    const info = db.prepare(
      `INSERT INTO audit_usage (ip, day, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, day) DO UPDATE SET count = count + 1 WHERE count < ?`
    ).run(ip, day, AUDIT_LIMIT_PER_DAY);
    if (!info || info.changes < 1) return { ok: false, remaining: 0 };
    const row = db.prepare('SELECT count FROM audit_usage WHERE ip = ? AND day = ?').get(ip, day);
    const c = row ? row.count : 1;
    return { ok: true, remaining: Math.max(0, AUDIT_LIMIT_PER_DAY - c) };
  } catch (e) { return { ok: true, remaining: AUDIT_LIMIT_PER_DAY }; }
}
function refundAuditAttempt(ip) {
  try {
    db.prepare(`UPDATE audit_usage SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
      WHERE ip = ? AND day = ?`).run(ip, auditDayStr());
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Sanitización del handle (misma que /api/trial/generate)
// ---------------------------------------------------------------------------
function sanitizeHandle(h) {
  return String(h || '').trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 40);
}

// ---------------------------------------------------------------------------
// Parseo de posteos desde el HTML del embed público.
// Devuelve [{type, shortcode, taken_at, caption, comments, likes, thumb}]
// ---------------------------------------------------------------------------
function decodeCaption(raw) {
  // El archivo trae el caption con doble escape: \" para comillas, \\uXXXX y
  // \\n literales (2 backslashes). Se baja un nivel y se decodifica.
  let s = String(raw || '')
    .replace(/\\"/g, '"')    // \" -> "
    .replace(/\\\\/g, '\\'); // \\ -> \
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
    try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; }
  });
  s = s.replace(/\\n|\\r|\\t/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 600);
}

// (D4) La captura del caption no puede distinguir el \" de cierre del \"
// escapado dentro del texto: se come el terminador y sigue tragando el JSON
// que sigue (edge_media_to_comment, display_url…) hasta el tope de captura.
// Resultado medido en la práctica de 200 perfiles: 40% de los captions con
// residuo JSON pegado, que envenena ganchos/CTA/temas del digest. Acá se
// corta en el primer marcador de residuo — la misma lista validada sobre
// 1.834 captions reales en esa práctica, sin falsos positivos.
const CAPTION_RESIDUE_CUTS = ['"}},', '"}}]', 'edge_media_to_comment', 'edge_liked_by', '\\"edge_', '","edge_'];
function cleanCaptionResidue(s) {
  let out = String(s || '');
  let cut = out.length;
  for (const k of CAPTION_RESIDUE_CUTS) {
    const i = out.indexOf(k);
    if (i >= 0 && i < cut) cut = i;
  }
  return out.slice(0, cut)
    .replace(/\\+\//g, '/') // restos de escape de '/': \/ \\/ → /
    .replace(/\\u[0-9a-fA-F]{0,3}$/, '') // escape \uXXXX cortado por el tope de captura
    .replace(/\\+$/, '')
    .replace(/"$/, '')
    .trim();
}

// (2026-10-24) La grilla real tiene posts_count posteos, pero el embed
// trae ADEMÁS un nodo suelto fuera de graphql_media (un shortcode_media
// destacado al final del documento) que el escaneo lineal cuenta como
// posteo extra: la cuenta 12 leía su Pieza 1 DOS VECES (con otro shortcode
// y, según la variante del HTML, hasta otra fecha parseada, así que la
// deduplicación no siempre lo colapsa). Regla: se conservan los primeros
// posts_count posteos de PRIMER NIVEL en orden de documento (los hijos de
// carrusel — sin fecha ni caption — no cuentan ni se descartan acá; los
// filtra cada consumidor). Sin contador confiable, no se recorta nada.
function capPostsToGrid(posts, postsCount) {
  if (!Array.isArray(posts) || typeof postsCount !== 'number' || !(postsCount >= 0)) return posts;
  let seen = 0;
  return posts.filter((p) => {
    const top = !!p && ((typeof p.taken_at === 'number' && p.taken_at > 0) || !!String(p.caption || '').trim());
    if (!top) return true;
    seen++;
    return seen <= postsCount;
  });
}

function parseEmbedPosts(html) {
  const posts = [];
  try {
    const BS = String.fromCharCode(92);
    const Q = BS + '"'; // en el archivo: \" (backslash + comilla)
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\{' + esc(Q) + '__typename' + esc(Q) + ':' + esc(Q) +
      '(GraphImage|GraphVideo|GraphSidecar)' + esc(Q), 'g');
    let m;
    const seenPostKeys = new Set(); // (2026-10-24) el embed REPITE nodos del mismo posteo
    while ((m = re.exec(html)) && posts.length < MAX_POSTS) {
      const segRaw = html.slice(m.index, m.index + 9000);
      const seg = segRaw.split(Q).join('"'); // un nivel de escape menos
      const f = (rx) => { const mm = rx.exec(seg); return mm ? mm[1] : null; };
      // El caption se captura del segmento CRUDO (con \" intactos) y lo
      // decodifica decodeCaption en sus dos niveles.
      const fRaw = (rx) => { const mm = rx.exec(segRaw); return mm ? mm[1] : null; };
      // (LOTE PUBLICADOS-3 · 4/11) La ventana de 9000 caracteres se
      // desbordaba al posteo siguiente: la lámina de un carrusel heredaba
      // fecha, caption y shortcode del posteo siguiente, pasaba
      // isTopLevelReadPost y el dedup por fecha|caption borraba el
      // posteo real siguiente (caso 4/11: una lámina del carrusel del
      // café heredó los datos del 1/11 y el 1/11 real desapareció de la
      // grilla, con la lámina 4ª y el 29/10 cortado por el tope de 6).
      // Los campos de IDENTIDAD (fecha, shortcode, caption) se extraen
      // solo del nodo propio: hasta el próximo __typename Graph* o
      // 9000 caracteres. El resto (thumb, likes, comments, pinned)
      // sigue con la ventana completa de siempre, sin cambios: los
      // campos propios de un carrusel padre preceden a su bloque de
      // hijos, así que no se pierde nada de un posteo real.
      const segEnd = (() => {
        const tail = html.slice(m.index + m[0].length);
        const bm = /__typename\\":\\"Graph(?:Image|Video|Sidecar)/.exec(tail);
        return bm ? m.index + m[0].length + bm.index : m.index + 9000;
      })();
      const segRawId = html.slice(m.index, Math.min(segEnd, m.index + 9000));
      const segId = segRawId.split(Q).join('"');
      const fId = (rx) => { const mm = rx.exec(segId); return mm ? mm[1] : null; };
      const fRawId = (rx) => { const mm = rx.exec(segRawId); return mm ? mm[1] : null; };
      const qe = '\\\\"'; // en regex: casa con \" del archivo
      const capRaw = fRawId(new RegExp(qe + 'text' + qe + ':' + qe + '((?:[^"\\\\]|\\\\.){0,500})'));
      // (LOTE LOCALIZAR-RECENTS · v975) La captura del display_url ya NO
      // se corta a 600: las URLs firmadas de la CDN miden 610–670
      // caracteres limpias (más en crudo, con los escapes) y el corte
      // amputaba la firma `oh` — la CDN respondía 403 a TODAS las
      // descargas y ninguna miniatura del embed se localizaba jamás
      // (verificado en vivo 12/11: thumb parseada de 585 chars con la
      // firma cortada; la URL completa descarga OK en <1 s con el
      // fetcher de producción). Tope amplio de captura; el resto del
      // parser no se toca.
      const thumbRaw = f(/"display_url":"((?:[^"\\]|\\.){0,2048})/);
      const takenAt = fId(/"taken_at_timestamp":(\d+)/) ? parseInt(fId(/"taken_at_timestamp":(\d+)/), 10) : null;
      const caption = cleanCaptionResidue(decodeCaption(capRaw || ''));
      // (2026-10-24) Nodo duplicado del MISMO posteo (misma fecha + mismo
      // caption, otro shortcode de CDN): el embed de la cuenta 12 traía la
      // Pieza 1 dos veces y la lectura contaba 8 «posteos» sobre 2 reales.
      // Se conserva la primera aparición; el resto es el mismo posteo.
      if (takenAt != null) {
        const dupKey = takenAt + '|' + caption.slice(0, 80);
        if (seenPostKeys.has(dupKey)) continue;
        seenPostKeys.add(dupKey);
      }
      posts.push({
        type: m[1],
        shortcode: fId(/"shortcode":"([A-Za-z0-9_-]+)"/),
        taken_at: takenAt,
        caption,
        comments: f(/"edge_media_to_comment":\{"count":(\d+)/) ? parseInt(f(/"edge_media_to_comment":\{"count":(\d+)/), 10) : null,
        // (D3) Los likes están en el mismo objeto del embed y se descartaban:
        // sin ellos, el 27% de las cuentas quedaba sin ranking mejor/peor
        // posteo. analysis-engine.signalsFromPosts ya consume p.likes.
        likes: f(/"edge_liked_by":\{"count":(\d+)/) ? parseInt(f(/"edge_liked_by":\{"count":(\d+)/), 10) : null,
        pinned: (() => { const pm = /"pinned_for_users":\[([^\]]{0,200})\]/.exec(seg); return pm ? (pm[1].trim() ? true : false) : null; })(), // (v360) fijado según el embed; sin marca -> null
        thumb: thumbRaw ? cleanThumbUrl(thumbRaw) : null,
        // (LOTE ESTILO-PROPIO · 7/11) Duración del video, best-effort
        // (del nodo propio, como el resto de la identidad): la firma de
        // estilo la usa para saber si el cliente postea video y de qué
        // largo. Sin dato → null, nunca inventada.
        video_duration: fId(/"video_duration":([\d.]+)/) ? parseFloat(fId(/"video_duration":([\d.]+)/)) : null,
      });
    }
  } catch (_) {}
  return posts;
}

/* (LOTE RUBRO-50-50) Limpieza COMPLETA de la URL del thumb: el embed
 * trae doble escape (https:\\/\\/scontent…, con \\u0025/\\u0026 en los
 * query params) y el viejo replace solo quitaba \/, dejando una
 * barra invertida suelta: la URL no pasaba el filtro /^https:\/\//"
 * de classifyWithVision y la visión recibía 0 fotos (0 llamadas
 * en la corrida 7/11). Iterar hasta 3 veces cubre cualquier nivel de
 * escape y es idempotente una vez limpia (verificado en thumb-test.js). */
function cleanThumbUrl(u) {
  let s = String(u || '');
  for (let i = 0; i < 3; i++) s = s.replace(/\\\\/g, '\\').replace(/\\\//g, '/');
  s = s.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&');
  return s;
}

// ---------------------------------------------------------------------------
// Datos públicos del perfil + posteos (best-effort)
// ---------------------------------------------------------------------------
// (LOTE TIC-FUENTE) Verificado desde el HTML crudo de la PÁGINA del
// perfil (no del embed): true/false solo con identidad clara, null si no
// se puede afirmar. Regla: se recogen las ocurrencias de is_verified
// (comillas planas o escapadas) cuyo username MÁS CERCANO ANTES, dentro
// de una ventana de 4000 caracteres, sea el handle pedido (sin distinción
// de mayúsculas). Si el conjunto es no vacío y unánime, ese valor; si no
// hay ninguna, hay desacuerdo, o la página no trae el username pedido,
// null — el llamador conserva el valor del embed. Nunca se inventa un
// true: sin identidad clara, null. El modo de fallo es conservador: un
// username extraño entre el username propio y el is_verified (p. ej. un
// texto de bio que lo mencione) hace que la ocurrencia se descarte y se
// conserve el embed, jamás que se afirme un verificado ajeno.
function parseProfilePageVerified(html, handle) {
  const h = String(handle || '').replace(/^@+/, '').trim().toLowerCase();
  const s = String(html || '');
  if (!h || !s) return null;
  const rxUser = /"username\\?":\\?"([^"\\]+)\\?"/g;
  const rxVer = /is_verified\\?":(true|false)/g;
  const users = [];
  let m;
  while ((m = rxUser.exec(s)) !== null) users.push({ at: m.index, name: String(m[1]).toLowerCase() });
  if (!users.some((u) => u.name === h)) return null;
  const vals = [];
  while ((m = rxVer.exec(s)) !== null) {
    let near = null;
    for (let i = users.length - 1; i >= 0; i--) {
      if (users[i].at < m.index && m.index - users[i].at <= 4000) { near = users[i]; break; }
    }
    if (near && near.name === h) vals.push(m[1] === 'true');
  }
  if (!vals.length) return null;
  if (vals.every((v) => v === true)) return true;
  if (vals.every((v) => v === false)) return false;
  return null;
}
// (LOTE TIC-FUENTE) Precedencia del verificado para la home: la página
// del perfil manda cuando trae un valor con identidad clara (true o
// false); si no, se conserva el valor del embed. source dice de dónde
// salió ('page'/'embed') para observabilidad admin. Solo la usa
// homeProfileReadAndStore; fetchAuditData y el resto de consumidores
// siguen con el valor del embed, sin cambios.
function resolveHomeVerified(embedVerified, pageHtml, handle) {
  const pageVer = pageHtml ? parseProfilePageVerified(pageHtml, handle) : null;
  if (pageVer === true || pageVer === false) return { is_verified: pageVer, source: 'page' };
  const ev = (embedVerified === true ? true : (embedVerified === false ? false : null));
  return { is_verified: ev, source: 'embed' };
}
// (ESTUDIO-PROFUNDO M2 · RANKEO PROPIO) Seguidores desde el HTML del
// embed ya bajado (misma fuente y mismo regex que fetchAuditData, que
// lee followers_count del perfil). fetchIgProfile NO trae seguidores
// (solo colors/pic/name), así que sin esto el prefill de la prueba
// nunca podría calcular la tasa de respuesta. NUNCA lanza; sin el
// dato, null (no se inventa).
function followersFromEmbedHtml(html) {
  try {
    const s = String(html || '').split(String.fromCharCode(92) + '"').join('"');
    const m = /"followers_count":(\d+)/.exec(s);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch (_) { return null; }
}
async function fetchAuditData(handle, fetchOverride, profOverride) {
  const ig = sanitizeHandle(handle);
  if (!ig) return { ok: false, error: 'Pasame tu @ de Instagram' };
  let html = null;
  try {
    html = fetchOverride ? await fetchOverride(ig) : await demo.fetchIgEmbedHtml(ig);
  } catch (e) { html = null; }
  if (!html) return { ok: false, error: 'No encontramos ese Instagram (puede ser privado o no existir)' };
  const bio = demo.extractIgBiography(html) || '';
  // (D1/D2) El HTML del embed NO trae biography ni external_url (verificado
  // en vivo: 0 ocurrencias en 236 KB; la página de perfil sale como shell de
  // login y web_profile_info devuelve 429 sin sesión). La extracción es
  // correcta — el dato no está en esta fuente. Por eso bio/link vacíos acá
  // significan NO LEÍDO, no "el cliente no tiene": se marca unread para que
  // ningún consumidor lo puntúe como vacío (antes el eje vidriera castigaba
  // la ceguera del sistema como si fuera falla del cliente: 195/195 bios en
  // "" contra 49/49 reales en la validación de la práctica).
  const bioUnread = !html.includes('\\"biography\\"');
  const seg = html.split(String.fromCharCode(92) + '"').join('"');
  const f = (rx) => { const m = rx.exec(seg); return m ? m[1] : null; };
  const postsCountRaw = f(/"posts_count":(\d+)/);
  const posts = capPostsToGrid(parseEmbedPosts(html), postsCountRaw ? parseInt(postsCountRaw, 10) : null);
  // Foto de perfil (best-effort, para mostrar en el reporte). Si el llamador
  // ya trajo el perfil (profOverride = resultado de demo.fetchIgProfile),
  // no se repite la descarga.
  let pic = null, fullName = '';
  if (profOverride) {
    pic = profOverride.pic || null;
    fullName = profOverride.name || '';
  } else {
    try {
      const prof = await demo.fetchIgProfile(ig);
      if (prof) { pic = prof.pic || null; fullName = prof.name || ''; }
    } catch (_) {}
  }
  // Seguidos: el embed lo trae como "following_count" o como edge_follow.
  const followingRaw = f(/"following_count":(\d+)/) || f(/"edge_follow":\{"count":(\d+)/);
  // Verificado: el embed trae "is_verified" en el bloque del perfil
  // (misma fuente que followers/posts). true/false real; si no viene, null.
  const verRaw = f(/"is_verified":(true|false)/);
  // (v230) LECTURA PROFUNDA: el link de la bio (external_url del perfil)
  // — la puerta a su tienda/reserva real (bloque bio_link del digest).
  const linkRaw = f(/"external_url":"((?:[^"\\]|\\.){1,300})"/);
  const bioLink = linkRaw ? linkRaw.replace(/\\\//g, '/').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; } }) : '';
  return {
    ok: true,
    profile: {
      handle: ig,
      name: fullName,
      bio,
      bio_unread: bioUnread,
      link: /^https?:\/\//i.test(bioLink) ? bioLink : '',
      link_unread: linkRaw == null,
      followers: f(/"followers_count":(\d+)/) ? parseInt(f(/"followers_count":(\d+)/), 10) : null,
      posts_count: postsCountRaw ? parseInt(postsCountRaw, 10) : null,
      following: followingRaw ? parseInt(followingRaw, 10) : null,
      is_verified: verRaw === 'true' ? true : (verRaw === 'false' ? false : null),
      category: demo.categoryFromText(bio + ' ' + fullName),
      pic,
    },
    posts,
  };
}

// ---------------------------------------------------------------------------
// Proyección de perfil para /prueba (v184): forma compacta y publicable del
// perfil real del visitante (identidad + conteos TAL CUAL vinieron + hasta 9
// fotos recientes de su grilla). Es la materia prima del "su perfil HOY vs
// CON Posty": NINGÚN número se toca ni se completa — lo que no vino, va null
// y el front lo oculta. fallbackPic: la foto ya descargada por el llamador.
// ---------------------------------------------------------------------------
function trialProfileFromAudit(data, fallbackPic) {
  if (!data || !data.ok || !data.profile || !data.profile.handle) return null;
  const p = data.profile;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    handle: p.handle,
    name: p.name || '',
    bio: p.bio || '',
    // (D2) La marca de "no leído" viaja con el perfil: bio '' + unread NO es
    // una bio vacía — es una bio que el sistema no pudo ver.
    bio_unread: !!p.bio_unread,
    // (v230) El link de su bio, tal cual lo publicó (la lectura profunda
    // lo sigue hasta su tienda/reserva: bloque bio_link del digest).
    link: p.link || '',
    link_unread: !!p.link_unread,
    followers: num(p.followers),
    posts_count: num(p.posts_count),
    following: num(p.following),
    pic: p.pic || fallbackPic || null,
    photos: (data.posts || []).map((x) => (x && x.thumb) || null).filter(Boolean).slice(0, 9),
    // (v229) FUNDAMENTO: los captions reales de sus últimos posteos —
    // de acá el client_digest mina los temas de SU feed (antes el perfil
    // de la prueba descartaba los captions que parseEmbedPosts ya traía).
    captions: (data.posts || []).map((x) => String((x && x.caption) || '').slice(0, 240)).filter(Boolean).slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// Auditoría EN VIVO de /prueba (v210): análisis del Instagram real del
// visitante, determinístico y con CERO IA — cada hallazgo se computa de sus
// posteos públicos (fechas, tipos de media, captions, horarios) y lleva su
// número real de hoy; cuando la palanca es algo que Posty controla, suma el
// número con Posty. Presentación SIEMPRE en positivo (oportunidad, nunca
// reto) y agrupada: mejorar / incrementar / reducir. Lo que no se puede
// computar se OMITE — jamás relleno genérico ni métricas privadas
// (alcance, guardados, ventas no existen en los datos y no se mencionan).
// opts.paletteHues: tonos dominantes del feed (analyzePalette), opcional —
// sin ese dato la señal de línea visual no se emite.
// ---------------------------------------------------------------------------
const TRIAL_HOOK_RE = /[¿¡]|escrib|reserv|pedí|pedi|mirá|mira|vení|veni|probá|proba|aprovech|comentá|comenta|guardá|guarda|compart|sumate|anotá|anota|hacé|hace|descubr|conocé|conoce|encarg|empezá|empeza|agendá|agenda|\b(book|save|comment|tag|order|try|discover|join|tap|share|message|stop scrolling|check out|grab|shop now)\b/i;

function fmtRate210(x, lang) {
  const v = Math.round(x * 10) / 10;
  if (lang === 'en') return String(v);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
}

function trialAuditFromData(data, opts = {}) {
  // (v274 · MODO EN) opts.lang 'en': los hallazgos de la auditoría en vivo
  // salen en inglés (mismos textos que analysis-engine EN).
  const en = opts.lang === 'en';
  const T = (es, enS) => (en ? enS : es);
  if (!data || !data.ok || !Array.isArray(data.posts)) return null;
  const posts = data.posts.filter((p) => p && typeof p === 'object');
  const n = posts.length;
  const withTs = posts
    .filter((p) => Number.isFinite(p.taken_at) && p.taken_at > 0)
    .map((p) => p.taken_at)
    .sort((a, b) => a - b);
  const types = { GraphImage: 0, GraphVideo: 0, GraphSidecar: 0 };
  posts.forEach((p) => { if (types[p.type] !== undefined) types[p.type]++; });

  const signals = {
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
    palette_hues: opts.paletteHues != null ? opts.paletteHues : null,
  };
  const findings = [];
  const nowSec = Math.floor(Date.now() / 1000);

  // --- Ritmo: posteos por semana en la ventana disponible (piso de 7 días
  // para que un racimo reciente no infle la tasa) ---
  let ritmo = null;
  if (withTs.length >= 2) {
    const spanDays = Math.max(7, (withTs[withTs.length - 1] - withTs[0]) / 86400);
    ritmo = withTs.length / (spanDays / 7);
    signals.posts_per_week = Math.round(ritmo * 10) / 10;
  }
  if (ritmo != null && ritmo < 4) {
    findings.push({
      group: 'incrementar',
      text: T('Tu ritmo de publicación tiene mucho para crecer', 'Your posting rhythm has plenty of room to grow'),
      now: fmtRate210(ritmo, opts.lang) + T(' posteos por semana', ' posts per week'),
      with_posty: T('7 posteos + 1 reel por semana: tu semana completa, armada y programada', '7 posts + 1 reel per week: your full week, built and scheduled'),
    });
  }

  // --- Racha de silencio: hueco máximo entre posteos y días desde el último
  let maxGap = null;
  let sinceLast = null;
  if (withTs.length >= 2) {
    maxGap = 0;
    for (let i = 1; i < withTs.length; i++) {
      maxGap = Math.max(maxGap, Math.round((withTs[i] - withTs[i - 1]) / 86400));
    }
    signals.max_gap_days = maxGap;
  }
  if (withTs.length >= 1) {
    sinceLast = Math.max(0, Math.round((nowSec - withTs[withTs.length - 1]) / 86400));
    signals.days_since_last = sinceLast;
  }
  if (sinceLast != null && sinceLast >= 7) {
    findings.push({
      group: 'reducir',
      text: T('Cada día sin publicar es un día que tu negocio no aparece', 'Every day without posting is a day your business does not show up'),
      now: T('hace ' + sinceLast + ' días que no publicás', 'it has been ' + sinceLast + ' days since your last post'),
      with_posty: T('0 días en silencio: tu semana se programa sola', '0 silent days: your week schedules itself'),
    });
  } else if (maxGap != null && maxGap >= 10) {
    findings.push({
      group: 'reducir',
      text: T('Entre posteo y posteo tu perfil pasa rachas largas en silencio', 'Between posts, your profile goes through long silent stretches'),
      now: T('tu racha más larga fue de ' + maxGap + ' días', 'your longest stretch was ' + maxGap + ' days'),
      with_posty: T('0 días en silencio: tu semana se programa sola', '0 silent days: your week schedules itself'),
    });
  }

  // --- Mix de formatos: los reels que faltan ---
  if (n >= 3) {
    const v = types.GraphVideo;
    if (v === 0) {
      findings.push({
        group: 'incrementar',
        text: T('Todavía no aprovechás los reels, el formato que más empuja Instagram', 'You are not using reels yet — the format Instagram pushes the most'),
        now: T('0 reels en tus últimos ' + n + ' posteos', '0 reels in your last ' + n + ' posts'),
        with_posty: T('1 reel por semana, creado por Posty', '1 reel per week, created by Posty'),
      });
    } else if (v / n < 0.2) {
      findings.push({
        group: 'incrementar',
        text: T('Los reels aparecen poco en tu mix de formatos', 'Reels show up very little in your format mix'),
        now: T('solo ' + v + ' de ' + n + ' posteos son reels', 'only ' + v + ' of your ' + n + ' posts are reels'),
        with_posty: T('1 reel por semana, creado por Posty', '1 reel per week, created by Posty'),
      });
    }
  }

  // --- Horarios: dispersión de franjas (solo con ≥5 posteos con hora;
  // AR y UY, los países de la prueba, son UTC-3) ---
  if (withTs.length >= 5) {
    const bands = [0, 0, 0, 0, 0, 0];
    withTs.forEach((ts) => {
      const h = new Date((ts - 3 * 3600) * 1000).getUTCHours();
      bands[Math.floor(h / 4)]++;
    });
    const distinct = bands.filter((c) => c > 0).length;
    const topShare = Math.max.apply(null, bands) / withTs.length;
    signals.hour_bands = distinct;
    signals.top_band_share = Math.round(topShare * 100) / 100;
    if (distinct >= 4 && topShare < 0.6) {
      findings.push({
        group: 'mejorar',
        text: T('Tus posteos salen en horarios muy repartidos, sin una franja que se repita', 'Your posts go out at scattered times, with no time band that repeats'),
        now: T('publicás en ' + distinct + ' franjas horarias distintas', 'you post across ' + distinct + ' different time bands'),
        with_posty: T('una franja fija: cada posteo sale programado, siempre en horario', 'one fixed band: every post goes out scheduled, always on time'),
      });
    }
  }

  // --- Captions: cuántos abren con gancho (pregunta o llamado en la
  // primera frase) ---
  const caps = posts.map((p) => String(p.caption || '').trim()).filter(Boolean);
  signals.captions_n = caps.length;
  if (caps.length >= 3) {
    let hooked = 0;
    caps.forEach((c) => {
      const open = (c.split(/(?<=[.!?…])\s+/)[0] || c).slice(0, 80);
      if (TRIAL_HOOK_RE.test(open)) hooked++;
    });
    const pct = Math.round((hooked / caps.length) * 100);
    signals.hook_pct = pct;
    if (pct < 50) {
      findings.push({
        group: 'mejorar',
        text: T('La mayoría de tus captions no abren con un gancho que frene el scroll', 'Most of your captions do not open with a hook that stops the scroll'),
        now: T('solo ' + hooked + ' de ' + caps.length + ' abren con pregunta o llamado', 'only ' + hooked + ' of ' + caps.length + ' open with a question or a call to action'),
        with_posty: T('Cada caption abre con gancho desde el primer día', 'Every caption opens with a hook from day one'),
      });
    }
  }

  // --- Línea visual: coherencia de paleta (solo si la señal es clara) ---
  if (signals.palette_hues != null && signals.palette_hues >= 6) {
    findings.push({
      group: 'mejorar',
      text: T('Tu feed mezcla varias paletas y se ve desparejo', 'Your feed mixes several palettes and looks uneven'),
      now: T(signals.palette_hues + ' tonos dominantes distintos', signals.palette_hues + ' different dominant tones'),
      with_posty: T('una sola línea visual: la tuya, aplicada en cada posteo', 'one single visual line: yours, applied to every post'),
    });
  }

  return { findings, signals, starter: n < 3 };
}

// ---------------------------------------------------------------------------
// Miniaturas LOCALES para la proyección de /prueba (v187): las URLs de la
// CDN de Instagram no se dejan hotlinkear desde el navegador (en vivo, la
// grilla HOY pintó la identidad real pero las 9 celdas en gris). El server
// las descarga UNA vez a MEDIA_DIR y el payload pasa a llevar
// /media/igthumb-<hash>.jpg — mismo origen, sin firma que expire.
// hash = sha256(handle|url): estable entre corridas, así la semana cacheada
// (72 h) reusa los archivos y las regeneraciones no re-descargan. El
// janitor de media los conserva mientras el payload cacheado los nombra
// (trial_cache es una tabla de texto más en su escaneo de referencias).
// NUNCA lanza: cada foto que falla queda null (celda neutra, como antes).
// fetchImpl inyectable para tests (misma convención que fetchOverride).
// ---------------------------------------------------------------------------
const IG_THUMB_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const THUMB_DL_CAP = 1500 * 1024;  // descarga máxima aceptada por miniatura
const THUMB_SOFT_CAP = 500 * 1024; // arriba de esto se recomprime a 540px

function fetchImageBuf(url, timeoutMs, hops) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': IG_THUMB_UA, 'Accept-Language': 'es-AR,es;q=0.9' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if ((hops || 0) >= 3) return reject(new Error('redirects'));
        return fetchImageBuf(res.headers.location, timeoutMs, (hops || 0) + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode)); }
      if (!String(res.headers['content-type'] || '').startsWith('image/')) { res.resume(); return reject(new Error('no-image')); }
      const chunks = [];
      let bytes = 0;
      res.on('data', (c) => {
        bytes += c.length;
        if (bytes > THUMB_DL_CAP) { req.destroy(new Error('too-big')); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

function shrinkThumb(abs) {
  return new Promise((resolve) => {
    const tmp = abs + '.tmp-' + process.pid + '-' + Math.floor(Math.random() * 1e6) + '.jpg';
    execFile('ffmpeg', ['-y', '-v', 'error', '-i', abs, '-vf', 'scale=540:-2', '-q:v', '4', tmp],
      { timeout: 8000 }, (err) => {
        if (!err) {
          try {
            const st = fs.statSync(tmp);
            if (st.isFile() && st.size > 200) { fs.renameSync(tmp, abs); return resolve(true); }
          } catch (e) { /* cae a conservar el original */ }
        }
        try { fs.unlinkSync(tmp); } catch (e) {}
        resolve(false);
      });
  });
}

async function localizeTrialPhotos(profile, mediaDir, fetchImpl) {
  if (!profile || !Array.isArray(profile.photos) || !profile.photos.length || !mediaDir) return profile;
  const handle = sanitizeHandle(profile.handle) || 'ig';
  try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (e) {}
  const get = fetchImpl || ((u) => fetchImageBuf(u, 2000));
  // (FEED-POSTEO-ABAJO · 6/11) SIN CAP: antes `.slice(0, 9)` — el 9 era la
  // tira 3×3 de la prueba, pero el home (homeProfileFromRead) reutiliza esta
  // función para TODOS los recents y el corte tiraba en silencio cada posteo
  // a partir del 10º (en vivo: los 4 más viejos de @posty.communitymanager
  // — 30/10, 29/10, 28/10 y 20/10 — no aparecían en el feed aunque siguen
  // en IG). La tira de la prueba sigue capada en su propio sitio
  // (trialProfileFromAudit: photos .slice(0, 9)); acá se localiza todo lo
  // que llega, sin ventana que corte: TODOS los posteos tienen que aparecer.
  profile.photos = await Promise.all(profile.photos.map(async (rawUrl) => {
    try {
      if (!rawUrl || typeof rawUrl !== 'string') return null;
      // Las URLs del embed vienen con escapes residuales (\/ por nivel de
      // JSON): sin limpiarlas, ni el chequeo de host ni la descarga matchean
      // (así salió la primera corrida real de v187: las 6 en null). Misma
      // limpieza que fetchIgProfile aplica a la foto de perfil.
      const url = rawUrl.replace(/\\/g, '');
      // Solo la CDN oficial de Instagram (mismo anti-SSRF que fetchIgProfile).
      if (!/^https:\/\/[a-z0-9.-]*cdninstagram\.com\//i.test(url)) return null;
      const hash = crypto.createHash('sha256').update(handle + '|' + url).digest('hex').slice(0, 24);
      const name = 'igthumb-' + hash + '.jpg';
      const abs = path.join(mediaDir, name);
      try { const st = fs.statSync(abs); if (st.isFile() && st.size > 1024) return '/media/' + name; } catch (e) {}
      const buf = await get(url);
      if (!buf || !buf.length) return null;
      fs.writeFileSync(abs, buf);
      if (buf.length > THUMB_SOFT_CAP) await shrinkThumb(abs);
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size < 200) { try { fs.unlinkSync(abs); } catch (e) {} return null; }
      return '/media/' + name;
    } catch (e) { return null; }
  }));
  return profile;
}

// ---------------------------------------------------------------------------
// (v196) Foto de perfil LOCAL para el póster de marca de la prueba: el
// medallón del póster se renderiza en el servidor (PIL), así que la pic —
// que llega como data URL desde fetchIgProfile — se materializa una vez en
// MEDIA_DIR con nombre determinístico igthumb-pic-<hash>.jpg (el prefijo
// igthumb- la cubre con la conservación de 72 h del janitor, igual que las
// miniaturas de la grilla, y el payload cacheado la referencia por nombre).
// NUNCA lanza: sin pic utilizable, el póster sale tipográfico.
// ---------------------------------------------------------------------------
async function localizeTrialPic(profile, mediaDir, fetchImpl) {
  if (!profile || !profile.pic || !mediaDir) return profile;
  try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (e) {}
  const handle = sanitizeHandle(profile.handle) || 'ig';
  const raw = String(profile.pic);
  try {
    let buf = null;
    let seed = raw;
    if (raw.startsWith('data:image/')) {
      const m = /^data:image\/(png|jpeg|webp);base64,([\s\S]+)$/.exec(raw);
      if (!m) return profile;
      buf = Buffer.from(m[2], 'base64');
      seed = handle + '|pic|' + raw.length + '|' + raw.slice(0, 128);
    } else {
      const url = raw.replace(/\\/g, '');
      if (!/^https:\/\/[a-z0-9.-]*cdninstagram\.com\//i.test(url)) return profile;
      seed = handle + '|pic|' + url;
      const get = fetchImpl || ((u) => fetchImageBuf(u, 2500));
      buf = await get(url);
    }
    if (!buf || buf.length < 1024 || buf.length > THUMB_DL_CAP) return profile;
    const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24);
    const name = 'igthumb-pic-' + hash + '.jpg';
    const abs = path.join(mediaDir, name);
    let exists = false;
    try { const st = fs.statSync(abs); exists = st.isFile() && st.size > 1024; } catch (e) {}
    if (!exists) {
      fs.writeFileSync(abs, buf);
      if (buf.length > THUMB_SOFT_CAP) await shrinkThumb(abs);
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size < 200) { try { fs.unlinkSync(abs); } catch (e) {} return profile; }
    }
    profile.pic_media = '/media/' + name;
  } catch (e) { /* sin pic local: el póster sale tipográfico */ }
  return profile;
}

// ---------------------------------------------------------------------------
// Señales heurísticas (números concretos que el LLM debe citar como evidencia)
// ---------------------------------------------------------------------------
const CTA_RE = /escribime|escribinos|whatsapp|wsp|link en (la )?bio|comentá|comenta|reservá|reservá tu|reserva tu|turno|escribime por|por dm|mensaje directo|visitanos|visítanos|te esperamos|pedidos|pedí|pedi tu|hacé tu pedido/i;
const HASHTAG_RE = /#[\p{L}0-9_]+/u;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

function computeSignals(profile, posts) {
  const withTs = posts.filter((p) => p.taken_at);
  let postsPerWeek = null, daysSpan = null;
  if (withTs.length >= 2) {
    const ts = withTs.map((p) => p.taken_at).sort((a, b) => a - b);
    daysSpan = Math.max(1, Math.round((ts[ts.length - 1] - ts[0]) / 86400));
    postsPerWeek = +(withTs.length / (daysSpan / 7)).toFixed(1);
  }
  const caps = posts.map((p) => p.caption || '');
  const nonEmpty = caps.filter((c) => c.trim().length > 0);
  const words = nonEmpty.map((c) => c.split(/\s+/).filter(Boolean).length);
  const avgLen = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0;
  const pct = (re) => caps.length ? Math.round((caps.filter((c) => re.test(c)).length / caps.length) * 100) : 0;
  const hashtagCounts = caps.map((c) => (c.match(/#[\p{L}0-9_]+/gu) || []).length);
  const avgHashtags = caps.length ? +(hashtagCounts.reduce((a, b) => a + b, 0) / caps.length).toFixed(1) : 0;
  const types = { GraphImage: 0, GraphVideo: 0, GraphSidecar: 0 };
  posts.forEach((p) => { if (types[p.type] !== undefined) types[p.type]++; });
  return {
    n_posts: posts.length,
    days_span: daysSpan,
    posts_per_week: postsPerWeek,
    captions_with_text_pct: caps.length ? Math.round((nonEmpty.length / caps.length) * 100) : 0,
    avg_caption_words: avgLen,
    cta_pct: pct(CTA_RE),
    hashtag_pct: pct(HASHTAG_RE),
    avg_hashtags: avgHashtags,
    emoji_pct: pct(EMOJI_RE),
    videos: types.GraphVideo,
    images: types.GraphImage,
    carousels: types.GraphSidecar,
    // (D2) Bio no leída ⇒ señales en null (sin datos), NUNCA 0/false: un eje
    // sin lectura no se promedia como malo. Sin la marca (perfiles de otras
    // fuentes) vale el comportamiento histórico.
    bio_length: profile.bio_unread ? null : (profile.bio || '').length,
    bio_has_what: profile.bio_unread ? null : /(vendemos|vendo|hacemos|hago|servicio|productos|turnos|env[ií]os|delivery|tienda)/i.test(profile.bio || ''),
    bio_unread: !!profile.bio_unread,
    followers: profile.followers,
    total_posts: profile.posts_count,
    palette_hues: null, // se completa con análisis de thumbnails (best-effort)
  };
}

// ---------------------------------------------------------------------------
// Paleta: baja hasta 4 thumbnails, extrae colores y cuenta "paletas distintas"
// (buckets de tono). Best-effort: si falla, palette_hues queda null.
// ---------------------------------------------------------------------------
function hexToHueBucket(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 0.12) return -1; // gris: no cuenta
  let h = 0;
  const d = mx - mn;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60); if (h < 0) h += 360;
  return Math.floor(h / 40); // 9 buckets
}

async function downloadThumb(url, timeoutMs = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PostaBot/1.0)' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 2 * 1024 * 1024) return null;
    return buf;
  } catch (_) { return null; } finally { clearTimeout(t); }
}

function extractColors(buf) {
  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `audit-thumb-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`);
    try { fs.writeFileSync(tmp, buf); } catch (_) { return resolve([]); }
    execFile('python3', [path.join(__dirname, 'extract_colors.py'), tmp], { timeout: 8000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return resolve([]);
      resolve(String(stdout || '').trim().split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c)));
    });
  });
}

async function analyzePalette(posts) {
  try {
    const thumbs = posts.map((p) => p.thumb).filter(Boolean).slice(0, MAX_THUMBS);
    if (!thumbs.length) return null;
    const bufs = await Promise.all(thumbs.map((u) => downloadThumb(u)));
    const hues = new Set();
    for (const buf of bufs) {
      if (!buf) continue;
      const cols = await extractColors(buf);
      cols.forEach((c) => { const b = hexToHueBucket(c); if (b >= 0) hues.add(b); });
    }
    return hues.size || null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// (LOTE ONBOARDING-DIVERTIDO v760 · análisis en paralelo) Perfil de estilo
// del feed: señales DETERMINÍSTICAS (cero IA, cero fetches nuevos salvo las
// miniaturas que analyzePalette ya descarga) desde los posteos del embed:
// ritmo, largo de captions, hashtags que más usa, mejores posteos (por
// likes) y paleta observada (buckets de tono). Todo nullable: lo que no se
// observó, no se afirma.
// ---------------------------------------------------------------------------
const HUE_NAMES_ES = ['rojo', 'naranja', 'amarillo', 'verde', 'turquesa', 'azul', 'violeta', 'rosa', 'rojo'];
const HUE_NAMES_EN = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink', 'red'];
function hueName(bucket, lang) {
  const b = Number(bucket);
  if (!Number.isFinite(b) || b < 0 || b > 8) return null;
  return (lang === 'en' ? HUE_NAMES_EN : HUE_NAMES_ES)[b] || null;
}
function paletteProfileFromHexes(hexes) {
  try {
    const buckets = [];
    (Array.isArray(hexes) ? hexes : []).forEach((h) => {
      if (typeof h !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(h)) return;
      const b = hexToHueBucket(h);
      if (b >= 0 && buckets.indexOf(b) < 0) buckets.push(b);
    });
    if (!buckets.length) return null;
    buckets.sort((a, b) => a - b);
    return {
      palette_buckets: buckets,
      palette_names: buckets.map((b) => hueName(b, 'es')).filter(Boolean),
      palette_names_en: buckets.map((b) => hueName(b, 'en')).filter(Boolean),
    };
  } catch (_) { return null; }
}
async function analyzePaletteBuckets(posts) {
  try {
    const thumbs = posts.map((p) => p.thumb).filter(Boolean).slice(0, MAX_THUMBS);
    if (!thumbs.length) return null;
    const bufs = await Promise.all(thumbs.map((u) => downloadThumb(u)));
    const buckets = new Set();
    for (const buf of bufs) {
      if (!buf) continue;
      const cols = await extractColors(buf);
      cols.forEach((c) => { const b = hexToHueBucket(c); if (b >= 0) buckets.add(b); });
    }
    return buckets.size ? Array.from(buckets).sort((a, b) => a - b) : null;
  } catch (_) { return null; }
}

// (ESTUDIO-PROFUNDO · mejora 4 MAPA DEL FEED) Paleta POR POSTEO: el tono
// dominante de cada posteo de la ventana (hasta 12), como mapa
// { shortcode: bucket 0-8 }. Reusa downloadThumb + extractColors (la
// misma extracción que analyzePaletteBuckets, sin reconstruir nada): el
// primer color que devuelve extract_colors.py es el dominante de la
// foto. Best-effort total: sin thumb, sin descarga o sin color, ese
// posteo simplemente no entra en el mapa (el mapa del feed marca
// hue=null con fuente 'sin_dato', nunca inventa un tono). NUNCA lanza.
async function analyzePalettePerPost(posts) {
  const out = {};
  try {
    const list = (Array.isArray(posts) ? posts : []).filter((p) => p && p.thumb && p.shortcode).slice(0, 12);
    if (!list.length) return out;
    const bufs = await Promise.all(list.map((p) => downloadThumb(p.thumb)));
    for (let i = 0; i < list.length; i++) {
      try {
        const buf = bufs[i];
        if (!buf) continue;
        const cols = await extractColors(buf);
        for (const c of cols) {
          const b = hexToHueBucket(c);
          if (b >= 0) { out[list[i].shortcode] = b; break; }
        }
      } catch (_) { /* ese posteo queda sin tono */ }
    }
  } catch (_) {}
  return out;
}
async function trialStyleProfile(posts, profile, opts = {}) {
  try {
    const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object');
    if (!list.length && !(opts && Array.isArray(opts.webPalette) && opts.webPalette.length)) return null;
    const sig = computeSignals(profile || {}, list);
    const caps = list.map((p) => String(p.caption || '')).filter((c) => c.trim());
    const tagCounts = {};
    caps.forEach((c) => {
      (c.match(/#[\p{L}0-9_]+/gu) || []).forEach((t) => {
        const k = t.slice(1).toLowerCase();
        if (k.length >= 2 && k.length <= 30) tagCounts[k] = (tagCounts[k] || 0) + 1;
      });
    });
    const hashtagsTop = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 5);
    const liked = list.filter((p) => Number.isFinite(p.likes) && p.likes > 0)
      .sort((a, b) => b.likes - a.likes).slice(0, 3)
      .map((p) => ({ shortcode: p.shortcode || '', likes: p.likes, caption_head: String(p.caption || '').slice(0, 80) }));
    // (ESTUDIO-PROFUNDO M2 · RANKEO PROPIO) Top 3 por TASA de respuesta
    // contra el promedio PROPIO (no por likes absolutos) + porqué
    // (formato, gancho, tema, hora). Lazy require dentro de try: si el
    // módulo no está, el perfil sale igual que siempre (best_posts
    // intacto); nunca rompe el estudio ni inventa una tasa.
    let ranking = null;
    try { const sr = require('./study-ranking'); ranking = sr.rankOwnPosts(list, sig.followers, { lang: (opts && opts.lang) || 'es' }); } catch (_) { ranking = null; }
    let buckets = null;
    try {
      buckets = await Promise.race([analyzePaletteBuckets(list), new Promise((r) => setTimeout(() => r(null), 1500))]);
    } catch (_) { buckets = null; }
    const webProf = paletteProfileFromHexes(opts.webPalette || []);
    const allBuckets = Array.from(new Set([...(buckets || []), ...((webProf && webProf.palette_buckets) || [])])).sort((a, b) => a - b);
    const tone = (opts.tone === 'vos' || opts.tone === 'usted') ? opts.tone : 'neutral';
    const out = {
      posts_per_week: sig.posts_per_week,
      avg_caption_words: sig.avg_caption_words || 0,
      avg_hashtags: sig.avg_hashtags || 0,
      hashtags_top: hashtagsTop,
      best_posts: liked,
      // (ESTUDIO-PROFUNDO M2 · RANKEO PROPIO) Espacio de nombres propio:
      // top_posts (top 3 por tasa, con porqué) + ranking (resumen con la
      // tasa promedio propia y el motivo si no es calculable). Sin
      // seguidores, top_posts es [] y ranking lo documenta.
      top_posts: (ranking && ranking.top3) || [],
      ranking: ranking ? { calculable: ranking.calculable, seguidores: ranking.seguidores, promedio_tasa: ranking.promedio_tasa, n_posts: ranking.n_posts, n_medibles: ranking.n_medibles, motivo_no_calculable: ranking.motivo_no_calculable, nota: ranking.nota } : null,
      formats: { images: sig.images || 0, videos: sig.videos || 0, carousels: sig.carousels || 0 },
      palette_buckets: allBuckets.length ? allBuckets : null,
      palette_names: allBuckets.map((b) => hueName(b, 'es')).filter(Boolean),
      palette_names_en: allBuckets.map((b) => hueName(b, 'en')).filter(Boolean),
      tone,
    };
    const usable = out.posts_per_week != null || out.hashtags_top.length || out.best_posts.length || (out.top_posts && out.top_posts.length) || out.palette_names.length || tone !== 'neutral' || out.avg_caption_words > 0;
    return usable ? out : null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// (LOTE ESTILO-PROPIO · 7/11) Firma de estilo: de los últimos 12 posteos
// del cliente, QUÉ TIPO / QUÉ SE MUESTRA / CÓMO SE MUESTRA — con conteos
// y procedencia en el fundamento. Lo determinista (tipo, duración de video)
// sale del embed sin IA; el qué/cómo sale de UNA pasada de visión por
// posteo (inyectada por el llamador: opts.vision). Si la visión falta o
// falla, la firma lleva solo lo determinista y el dominante queda nulo:
// nunca se inventa un estilo. La firma NUNCA pasa por encima de la puerta
// de rubro: cada posteo sigue siendo de un producto real del fundamento.
// Límite con ESTUDIO-PROFUNDO (coordinador, mismo día): esta firma NO
// construye rankeo por respuesta, ni mapa de huecos del feed, ni minería
// de comentarios, ni ficha de oferta, ni competencia, ni re-estudio
// semanal — esos ítems viven en el lote del coordinador, no acá.
// ---------------------------------------------------------------------------
const FIRMA_QUE = ['producto_primer_plano', 'producto_accion', 'persona_camara', 'local', 'texto', 'otro'];
const FIRMA_ENCUADRE = ['primer_plano', 'plano_medio', 'plano_general', 'cenital', 'otro'];
const FIRMA_ANGULO = ['frontal', 'picado', 'contrapicado', 'otro'];
const FIRMA_LUZ = ['natural', 'calida', 'estudio', 'noche', 'otro'];
const FIRMA_PROCEDENCIA = ['tu feed', 'tu web', 'tu feed + tu web'];

function firmaCount(values) {
  const c = {};
  (values || []).forEach((v) => { if (v != null) c[v] = (c[v] || 0) + 1; });
  return c;
}
// Modo con desempate determinista: el primero del vocabulario en orden.
function firmaMode(counts, order) {
  let best = null, bestN = 0;
  for (const v of order) {
    const n = (counts && counts[v]) || 0;
    if (n > bestN) { best = v; bestN = n; }
  }
  return bestN > 0 ? { value: best, count: bestN } : null;
}
function firmaMedian(nums) {
  if (!nums || !nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// posts: salida de parseEmbedPosts (o ítems de web con type/thumb).
// opts: { vision: async (items) => [{que, encuadre, angulo, luz, texto}...],
//         visionTimeoutMs (default 8000), source: 'tu feed' | 'tu web' }.
// Devuelve la firma o null (sin posteos no hay firma: rama honesta).
async function trialStyleSignature(posts, opts = {}) {
  try {
    const list = (Array.isArray(posts) ? posts : []).filter((p) => p && typeof p === 'object').slice(0, 12);
    if (!list.length) return null;
    const n = list.length;
    const tipos = { foto: 0, video: 0, carrusel: 0 };
    list.forEach((p) => {
      if (p.type === 'GraphVideo') tipos.video++;
      else if (p.type === 'GraphSidecar') tipos.carrusel++;
      else tipos.foto++;
    });
    const durs = list.filter((p) => p.type === 'GraphVideo' && Number.isFinite(p.video_duration) && p.video_duration > 0).map((p) => p.video_duration);
    const med = firmaMedian(durs);
    const procedencia = FIRMA_PROCEDENCIA.includes(opts.source) ? opts.source : 'tu feed';
    // Visión por posteo (inyectada por el llamador): una pasada,
    // best-effort, con tope. Si falla o no clasifica nada, lo
    // determinista sobrevive y el dominante queda nulo.
    let vis = null;
    if (typeof opts.vision === 'function') {
      try {
        const items = list.map((p) => ({ thumb: p.thumb || null, shortcode: p.shortcode || null, type: p.type || null }));
        const r = await Promise.race([
          opts.vision(items),
          new Promise((res) => setTimeout(() => res(null), (opts.visionTimeoutMs || 8000))),
        ]);
        if (Array.isArray(r) && r.length) vis = r;
      } catch (_) { vis = null; }
    }
    const validVis = (v) => v && typeof v === 'object' && FIRMA_QUE.includes(v.que) && FIRMA_ENCUADRE.includes(v.encuadre) && FIRMA_ANGULO.includes(v.angulo) && FIRMA_LUZ.includes(v.luz) && (v.texto === true || v.texto === false || v.texto == null);
    const seen = (vis || []).filter(validVis);
    const que = firmaCount(seen.map((v) => v.que));
    const encuadre = firmaCount(seen.map((v) => v.encuadre));
    const angulo = firmaCount(seen.map((v) => v.angulo));
    const luz = firmaCount(seen.map((v) => v.luz));
    const textoEnImagen = { si: 0, no: 0 };
    seen.forEach((v) => { if (v.texto === true) textoEnImagen.si++; else if (v.texto === false) textoEnImagen.no++; });
    const qMode = firmaMode(que, FIRMA_QUE);
    const eMode = firmaMode(encuadre, FIRMA_ENCUADRE);
    const lMode = firmaMode(luz, FIRMA_LUZ);
    const tMode = firmaMode(tipos, ['foto', 'video', 'carrusel']);
    const dominante = qMode ? {
      tipo: (tMode && tMode.value) || null,
      que: qMode.value,
      encuadre: (eMode && eMode.value) || null,
      luz: (lMode && lMode.value) || null,
      count: qMode.count,
    } : null;
    return {
      n, tipos, que, encuadre, angulo, luz, texto_en_imagen: textoEnImagen,
      duraciones: { n: durs.length, mediana_seg: med == null ? null : Math.round(med * 10) / 10 },
      dominante, procedencia,
      sin_video: tipos.video === 0,
      vision_ok: seen.length > 0,
      observado: true,
    };
  } catch (_) { return null; }
}

// El dominante de la firma → código de estilo del catálogo (image-styles).
// null cuando no hay dominante o el qué no tiene estilo propio: la
// generación sigue su camino de siempre (sin forzar nada).
function firmaStyleCode(firma) {
  try {
    const d = firma && firma.dominante;
    if (!d || !FIRMA_QUE.includes(d.que)) return null;
    if (d.que === 'producto_primer_plano') return d.encuadre === 'cenital' ? '/flatlay' : '/product';
    if (d.que === 'producto_accion' || d.que === 'persona_camara') return '/lifestyle';
    if (d.que === 'local') return '/workspace';
    if (d.que === 'texto') return '/quote';
    return null;
  } catch (_) { return null; }
}

const FIRMA_QUE_ES = {
  producto_primer_plano: 'fotos de su producto en primer plano',
  producto_accion: 'fotos de su producto en acción',
  persona_camara: 'posteos con persona a cámara',
  local: 'fotos de su local',
  texto: 'posteos con texto en la imagen',
  otro: 'posteos de otro tipo',
};
const FIRMA_QUE_EN = {
  producto_primer_plano: 'close-up photos of their product',
  producto_accion: 'photos of their product in action',
  persona_camara: 'posts with a person on camera',
  local: 'photos of their place',
  texto: 'posts with text on the image',
  otro: 'other kinds of posts',
};
const FIRMA_PROC_EN = { 'tu feed': 'seen on their feed', 'tu web': 'seen on their website', 'tu feed + tu web': 'seen on their feed and website' };

// La firma, como líneas del fundamento: solo lo observado, con conteos y
// procedencia. Sin dominante, cero líneas (nunca se inventa un estilo).
function firmaGoalLines(firma, lang) {
  try {
    const d = firma && firma.dominante;
    if (!d || !FIRMA_QUE.includes(d.que)) return [];
    const en = lang === 'en';
    const label = (en ? FIRMA_QUE_EN : FIRMA_QUE_ES)[d.que] || d.que;
    const proc = en ? (FIRMA_PROC_EN[firma.procedencia] || 'seen on their feed') : (firma.procedencia || 'tu feed');
    const lines = [en
      ? `Their style: ${d.count} of ${firma.n || '?'} posts are ${label} (${proc}) — the first posts are made like that.`
      : `Su estilo: ${d.count} de ${firma.n || '?'} posteos son ${label} (${proc}) — los primeros posteos se hacen así.`];
    if (firma.sin_video) lines.push(en
      ? 'No video on their feed: the sample reel is shown as a sample, not as their style.'
      : 'No postea video: el reel de muestra sale como muestra, no como su estilo.');
    return lines;
  } catch (_) { return []; }
}

// ---------------------------------------------------------------------------
// Prompt para gpt-4o-mini (con checklist ANTI-GENERICO)
// ---------------------------------------------------------------------------
const CLICHES = [
  'publicá más seguido', 'publica mas seguido', 'publicar más seguido',
  'mejorá tus fotos', 'mejora tus fotos', 'mejorar tus fotos',
  'sé constante', 'se constante', 'sé consistente',
  'contenido de calidad', 'generá contenido de valor', 'genera contenido de valor',
  'interactuá con tu audiencia', 'interactua con tu audiencia',
  'usá hashtags relevantes', 'usa hashtags relevantes',
  'conocé a tu audiencia', 'conoce a tu audiencia',
  'contenido auténtico', 'sé auténtico', 'se autentico',
];

function buildAuditPrompt(profile, signals, captions, lang) {
  const capLines = captions.slice(0, 10).map((c, i) => `${i + 1}. "${c.slice(0, 160)}"`).join('\n');
  // (v395 · paridad) Rama EN: la auditoría pública acepta lang='en' y el
  // reporte sale íntegro en inglés (mismas reglas, mismos datos). Sin lang
  // (o 'es') el prompt histórico queda byte a byte como siempre.
  if (lang === 'en') {
    return {
      system: [
        'You are Posty, an Instagram auditor for businesses. You analyze REAL data from a public profile and return ONLY valid JSON (no markdown, no explanations).',
        'GOLDEN ANTI-GENERIC RULE: every finding must cite a concrete data point from what I give you (numbers, verbatim examples). FORBIDDEN to say "post more often", "improve your photos", "be consistent", "quality content" or any advice that would work for any account.',
        'If a data point is unavailable (null), do not invent: that dimension gets score null and line "Not enough data".',
        'Tone: direct and friendly. Like a friend who knows Instagram.',
        'Exact JSON format:',
        '{ "score": 0-100, "summary": "2 lines max",',
        '  "dimensions": [ {"key":"bio","label":"Bio","score":0-100|null,"line":"1 line with a concrete data point"}, {"key":"consistencia","label":"Visual consistency",...}, {"key":"captions","label":"Captions that sell",...}, {"key":"frecuencia","label":"Posting frequency",...}, {"key":"marca","label":"Brand & trust",...} ],',
        '  "fixes": [ {"title":"short","evidence":"concrete data point WITH A NUMBER or a verbatim quote","fix":"what to do, concrete and actionable","example":"an example rewritten for THEIR business"} ] (3 to 5, prioritized: highest impact first),',
        '  "wins": ["1-2 things they already do well, with a concrete data point"] }',
        'Calibration: 90+ excellent, 70-89 good, 50-69 needs work, under 50 urgent.',
        'Write EVERY string in the JSON in English (summary, labels, lines, fixes, wins, examples).',
      ].join('\n'),
      user: [
        `Profile: @${profile.handle}${profile.name ? ` (${profile.name})` : ''}`,
        signals.bio_unread
          ? 'Bio: (could not be read — the public HTML does not include it; do NOT treat it as empty: bio dimension with score null and line "Not enough data")'
          : `Bio (${signals.bio_length} characters): "${(profile.bio || '(empty)').slice(0, 300)}"`,
        `Followers: ${profile.followers ?? 'unknown'} · Total posts: ${profile.total_posts ?? 'unknown'}`,
        `Detected industry: ${profile.category || 'other'}`,
        '',
        'SIGNALS (latest posts analyzed: ' + signals.n_posts + '):',
        `- Frequency: ${signals.posts_per_week ?? 'no data'} posts/week (over ${signals.days_span ?? '?'} days)`,
        `- Mix: ${signals.videos} videos, ${signals.images} images, ${signals.carousels} carousels`,
        `- Captions with text: ${signals.captions_with_text_pct}% · average length: ${signals.avg_caption_words} words`,
        `- With a concrete CTA: ${signals.cta_pct}% · with hashtags: ${signals.hashtag_pct}% (average ${signals.avg_hashtags} per post) · with emojis: ${signals.emoji_pct}%`,
        `- Distinct color palettes in the feed: ${signals.palette_hues ?? 'no data'}`,
        `- The bio says what they sell: ${signals.bio_has_what == null ? 'no data (bio not read)' : (signals.bio_has_what ? 'yes' : 'no')}`,
        '',
        'Latest captions:',
        capLines || '(no captions)',
      ].join('\n'),
    };
  }
  return {
    system: [
      'Sos Posty, auditor de Instagram para negocios. Analizás DATOS REALES de un perfil público y devolvés SOLO JSON válido (sin markdown, sin explicaciones).',
      'REGLA DE ORO ANTI-GENÉRICA: cada hallazgo debe citar un dato concreto de los que te paso (números, ejemplos textuales). PROHIBIDO decir "publicá más seguido", "mejorá tus fotos", "sé constante", "contenido de calidad" o cualquier consejo que serviría para cualquier cuenta.',
      'Si un dato no está disponible (null), no inventes: esa dimensión lleva score null y line "Sin datos suficientes".',
      'Tono: rioplatense, directo, con onda. Como un amigo que sabe de Instagram.',
      'Formato JSON exacto:',
      '{ "score": 0-100, "summary": "2 líneas máx",',
      '  "dimensions": [ {"key":"bio","label":"Bio","score":0-100|null,"line":"1 línea con dato concreto"}, {"key":"consistencia","label":"Consistencia visual",...}, {"key":"captions","label":"Captions que venden",...}, {"key":"frecuencia","label":"Frecuencia",...}, {"key":"marca","label":"Marca y confianza",...} ],',
      '  "fixes": [ {"title":"corto","evidence":"dato concreto CON NÚMERO o cita textual","fix":"qué hacer, concreto y accionable","example":"ejemplo reescrito para SU negocio"} ] (3 a 5, priorizados: lo que más impacto tiene primero),',
      '  "wins": ["1-2 cosas que ya hacen bien, con dato concreto"] }',
      'Calibración: 90+ excelente, 70-89 bien, 50-69 necesita trabajo, menos de 50 urgente.',
    ].join('\n'),
    user: [
      `Perfil: @${profile.handle}${profile.name ? ` (${profile.name})` : ''}`,
      signals.bio_unread
        ? 'Bio: (no se pudo leer — el HTML público no la trae; NO la trates como vacía: dimensión bio con score null y line "Sin datos suficientes")'
        : `Bio (${signals.bio_length} caracteres): "${(profile.bio || '(vacía)').slice(0, 300)}"`,
      `Seguidores: ${profile.followers ?? 'desconocido'} · Posteos totales: ${profile.total_posts ?? 'desconocido'}`,
      `Rubro detectado: ${profile.category || 'otro'}`,
      '',
      'SEÑALES (últimos posteos analizados: ' + signals.n_posts + '):',
      `- Frecuencia: ${signals.posts_per_week ?? 'sin datos'} posteos/semana (en ${signals.days_span ?? '?'} días)`,
      `- Mix: ${signals.videos} videos, ${signals.images} imágenes, ${signals.carousels} carruseles`,
      `- Captions con texto: ${signals.captions_with_text_pct}% · largo promedio: ${signals.avg_caption_words} palabras`,
      `- Con CTA concreto: ${signals.cta_pct}% · con hashtags: ${signals.hashtag_pct}% (promedio ${signals.avg_hashtags} por posteo) · con emojis: ${signals.emoji_pct}%`,
      `- Paletas de color distintas en el feed: ${signals.palette_hues ?? 'sin datos'}`,
      `- La bio dice qué venden: ${signals.bio_has_what == null ? 'sin datos (bio no leída)' : (signals.bio_has_what ? 'sí' : 'no')}`,
      '',
      'Últimos captions:',
      capLines || '(sin captions)',
    ].join('\n'),
  };
}

function callAuditLlm(prompt, llmOverride) {
  if (llmOverride) return llmOverride(prompt);
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) return Promise.resolve({ ok: false, error: 'no_api_key' });
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: AUDIT_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(45000),
  }).then(async (res) => {
    if (!res.ok) return { ok: false, error: 'llm_' + res.status };
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return text ? { ok: true, text } : { ok: false, error: 'llm_empty' };
  }).catch(() => ({ ok: false, error: 'llm_error' }));
}

function containsCliche(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return CLICHES.some((c) => t.includes(c.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

function stripFences(s) {
  return String(s || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// ---------------------------------------------------------------------------
// Validación del JSON del LLM: estructura + evidencia concreta + sin clichés
// ---------------------------------------------------------------------------
function validateAudit(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not_object'] };
  const score = obj.score;
  if (!Number.isInteger(score) || score < 0 || score > 100) errors.push('bad_score');
  const dims = obj.dimensions;
  const KEYS = ['bio', 'consistencia', 'captions', 'frecuencia', 'marca'];
  if (!Array.isArray(dims) || dims.length !== 5) errors.push('bad_dimensions');
  else dims.forEach((d, i) => {
    if (!d || d.key !== KEYS[i]) errors.push('bad_dimension_key_' + i);
    if (!(d.score === null || (Number.isInteger(d.score) && d.score >= 0 && d.score <= 100))) errors.push('bad_dimension_score_' + i);
    if (!d.line || String(d.line).length < 10) errors.push('bad_dimension_line_' + i);
  });
  const fixes = obj.fixes;
  if (!Array.isArray(fixes) || fixes.length < 3 || fixes.length > 5) errors.push('bad_fixes_count');
  else fixes.forEach((fx, i) => {
    if (!fx.title || !fx.evidence || !fx.fix) errors.push('bad_fix_' + i);
    // La evidencia tiene que ser concreta: número o cita
    if (fx.evidence && !/\d/.test(String(fx.evidence)) && !/"/.test(String(fx.evidence))) errors.push('fix_no_evidence_' + i);
  });
  const wins = obj.wins;
  if (!Array.isArray(wins) || wins.length < 1 || wins.length > 2) errors.push('bad_wins');
  if (!obj.summary || String(obj.summary).length < 10) errors.push('bad_summary');
  if (containsCliche(JSON.stringify(obj))) errors.push('cliche_detected');
  if (errors.length) return { ok: false, errors };
  return { ok: true, audit: obj };
}

// ---------------------------------------------------------------------------
// Cache 72h por handle
// (v395 · paridad) El caché es POR IDIOMA: la clave histórica (el handle
// pelado) es la ES y queda intacta; la EN vive bajo '<handle>#en'. Sin esta
// separación, una auditoría pedida en inglés devolvía el reporte en español
// cacheado (y viceversa).
// ---------------------------------------------------------------------------
function auditCacheKey(handle, lang) {
  const ig = sanitizeHandle(handle);
  if (!ig) return null;
  return lang === 'en' ? ig + '#en' : ig;
}

function getCachedAudit(handle, lang) {
  const key = auditCacheKey(handle, lang);
  if (!key) return null;
  try {
    const hit = db.prepare('SELECT payload, created_at FROM audit_cache WHERE handle = ?').get(key);
    if (hit && Date.now() - hit.created_at < AUDIT_CACHE_HOURS * 3600 * 1000) {
      const audit = JSON.parse(hit.payload);
      return { audit, cached: true };
    }
    if (hit) db.prepare('DELETE FROM audit_cache WHERE handle = ?').run(key);
    if (Math.random() < 0.05) db.exec(`DELETE FROM audit_cache WHERE created_at < ${Date.now() - AUDIT_CACHE_HOURS * 3600 * 1000}`);
  } catch (_) {}
  return null;
}

function saveAuditCache(handle, audit, lang) {
  const key = auditCacheKey(handle, lang);
  if (!key) return;
  try {
    db.prepare(`INSERT INTO audit_cache (handle, payload, created_at) VALUES (?, ?, ?)
      ON CONFLICT(handle) DO UPDATE SET payload=excluded.payload, created_at=excluded.created_at`)
      .run(key, JSON.stringify(audit), Date.now());
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Orquestador principal. opts: { fetch, llm } para inyección en tests.
// ---------------------------------------------------------------------------
async function auditFeed(dbArg, handle, opts = {}) {
  // (v395 · paridad) opts.lang 'en': prompt, caché y errores en inglés.
  const en = opts.lang === 'en';
  const ig = sanitizeHandle(handle);
  if (!ig) return { ok: false, error: en ? 'Send me your Instagram @' : 'Pasame tu @ de Instagram' };
  const cached = getCachedAudit(ig, opts.lang);
  if (cached) return { ok: true, audit: cached.audit, cached: true };

  const data = await fetchAuditData(ig, opts.fetch);
  if (!data.ok) return { ok: false, error: en ? "We couldn't find that Instagram (it may be private or it may not exist)" : data.error };
  if (!data.posts.length) return { ok: false, error: en ? 'That Instagram has no public posts to analyze' : 'Ese Instagram no tiene posteos públicos para analizar' };

  const signals = computeSignals(data.profile, data.posts);
  try {
    signals.palette_hues = opts.palette !== undefined ? opts.palette : await analyzePalette(data.posts);
  } catch (_) { signals.palette_hues = null; }

  const prompt = buildAuditPrompt(data.profile, signals, data.posts.map((p) => p.caption).filter(Boolean), opts.lang);

  // Hasta 2 intentos: si el JSON es inválido o tiene clichés, se reintenta
  // con una instrucción más dura.
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt : {
      system: prompt.system + (en
        ? '\n\nYOUR PREVIOUS ANSWER WAS REJECTED (' + lastErr + '). This time EVERY fix must cite a number or a verbatim quote in "evidence", and generic advice is STRICTLY FORBIDDEN.'
        : '\n\nTU RESPUESTA ANTERIOR FUE RECHAZADA (' + lastErr + '). Esta vez CADA fix debe citar un número o cita textual concreta en "evidence", y está TERMINANTEMENTE PROHIBIDO cualquier consejo genérico.'),
      user: prompt.user,
    };
    const r = await callAuditLlm(p, opts.llm);
    if (!r.ok) { lastErr = r.error; continue; }
    let obj = null;
    try { obj = JSON.parse(stripFences(r.text)); } catch (e) { lastErr = 'bad_json'; continue; }
    const v = validateAudit(obj);
    if (v.ok) {
      const audit = Object.assign({}, v.audit, {
        handle: ig,
        name: data.profile.name || '',
        followers: data.profile.followers,
        pic: data.profile.pic || null,
        audited_at: Date.now(),
      });
      saveAuditCache(ig, audit, opts.lang);
      return { ok: true, audit, cached: false };
    }
    lastErr = v.errors.join(',');
  }
  return { ok: false, error: en ? "We couldn't analyze that Instagram right now. Try again in a few minutes." : 'No pudimos analizar ese Instagram ahora. Probá de nuevo en unos minutos.' };
}

module.exports = {
  auditFeed,
  getCachedAudit,
  consumeAuditAttempt,
  refundAuditAttempt,
  sanitizeHandle,
  computeSignals,
  buildAuditPrompt,
  validateAudit,
  containsCliche,
  CLICHES,
  parseEmbedPosts,
  cleanCaptionResidue,
  fetchAuditData,
  followersFromEmbedHtml,
  parseProfilePageVerified,
  resolveHomeVerified,
  trialProfileFromAudit,
  trialAuditFromData,
  analyzePalette,
  analyzePaletteBuckets,
  analyzePalettePerPost,
  hueName,
  paletteProfileFromHexes,
  trialStyleProfile,
  FIRMA_QUE,
  FIRMA_ENCUADRE,
  FIRMA_ANGULO,
  FIRMA_LUZ,
  trialStyleSignature,
  firmaStyleCode,
  firmaGoalLines,
  localizeTrialPhotos,
  localizeTrialPic,
  AUDIT_LIMIT_PER_DAY,
};
