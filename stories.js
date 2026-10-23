// stories.js — Historias automáticas de Posty.
//
// Genera stories 1080×1920 derivadas del contenido de la semana del cliente:
//   poll      → encuesta "esto o aquello" (A/B)
//   question  → pregunta abierta a la audiencia
//   countdown → promo/evento con fecha ("TERMINA EN X DÍAS")
//   repost    → historia gemela: espeja un posteo con UN gancho corto
//
// REGLAS DE LA GEMELO (v231, 2026-10-18 — la captura de Valentino: la vieja
// pegaba el «mirá el último post» gigante + el caption ENTERO del posteo,
// duplicado y sobre los ojos de la mascota):
//   · La gemela lleva UN SOLO gancho corto = el titular del posteo (≤8
//     palabras). NUNCA el caption, NUNCA duplicado.
//   · Si el caption/titular del posteo fuente no pasa el lint vigente
//     (anti-empalmes + captionPasses), la gemela NO sale: queda registrada
//     como omitida con el motivo (events: twin_story_omitted).
//   · El texto va en banda superior o inferior según las zonas tranquilas
//     de la foto (brand-card.py --band auto): nunca en el centro, nunca
//     sobre caras u ojos.
//   · (v330) POSTY NO SE REPITE: si la imagen fuente nació con el avatar
//     del negocio como protagonista (image_meta.avatar_protagonist), la
//     gemela NO estampa el medallón con ese mismo avatar. Para fotos de
//     producto del cliente y logos gráficos distintos del sujeto, el
//     medallón va como siempre.
//
// Render: brand-card.py en modo story (paleta del cliente SIEMPRE, texto
// grande y legible, safe areas de IG). Se guardan como posts con
// media_type='story' — la publicación la hace el pipeline existente
// (processDuePosts → publishStory). Nada se publica sin el flujo normal.
//
// Exporta: { STORY_TYPES, buildStoryContent, renderStoryPng, generateStory,
//            dailyStories, twinSourceCheck, twinContextFor, createTwinStory }
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { makeHeadline, captionPasses } = require('./generator');
const { captionOpenIsGarbled } = require('./hooks');

const BRAND_CARD_PY = path.join(__dirname, 'brand-card.py');
const STORY_W = 1080;
const STORY_H = 1920;
const STORY_TYPES = ['poll', 'question', 'countdown', 'repost'];
// Máx historias generadas por día por usuario (1-2/día según plan).
const STORIES_PER_DAY = 2;

function clean(s, max) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max || 140);
}

// ---------------------------------------------------------------------------
// buildStoryContent(type, ctx) → { headline, sub } | null
// Puro y determinista (sin IA): plantillas en rioplatense.
// ctx: { business, rubro, weekPosts:[{caption}], pollA, pollB, question,
//        promoTitle, eventDate (AAAA-MM-DD), postHeadline (gemela: titular
//        ya chequeado por twinSourceCheck), postImageAbs }
// ---------------------------------------------------------------------------
function buildStoryContent(type, ctx) {
  const c = ctx || {};
  if (type === 'poll') {
    // Sin opciones REALES del negocio no hay encuesta: jamás inventar el
    // contenido (antes caía a 'Medialunas/Tostadas' y esa encuesta de
    // panadería salía en cuentas de cualquier rubro — bug 2026-10-16).
    const a = clean(c.pollA, 40);
    const b = clean(c.pollB, 40);
    if (!a || !b) return null;
    return { headline: '¿Vos qué elegís?', sub: `A) ${a}    B) ${b}` };
  }
  if (type === 'question') {
    const q = clean(c.question, 90) || '¿Qué te gustaría ver por acá?';
    return { headline: q, sub: 'Respondeme por acá' };
  }
  if (type === 'countdown') {
    const title = clean(c.promoTitle, 80);
    if (!title || !c.eventDate) return null; // sin promo con fecha: no hay countdown
    const days = daysUntil(String(c.eventDate));
    if (days === null || days < 0 || days > 30) return null;
    const when = days === 0 ? 'TERMINA HOY' : days === 1 ? 'TERMINA MAÑANA' : `FALTAN ${days} DÍAS`;
    return { headline: title, sub: when };
  }
  if (type === 'repost') {
    // GEMELA (v231): UN solo gancho corto = el titular del posteo, ya
    // derivado y linteado por twinSourceCheck (ctx.postHeadline). El
    // caption NO entra a la historia: ni como sub ni como titular. Sin
    // titular limpio no hay gemela.
    const hook = clean(c.postHeadline, 90);
    if (!hook) return null;
    if (hook.split(/\s+/).length > 8) return null;
    return { headline: hook, sub: '' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// twinSourceCheck(post, opts) — la puerta de la gemela (v231).
// post: { caption, source_topic, intent } (la fila del posteo fuente).
// opts: { business, category, dna, igUsername } — el lint corre con los
// MISMOS insumos que usa la generación (así un caption sano no cae por
// gates que exigen el ADN, y uno roto no pasa por ningún atajo).
// Devuelve { ok:true, headline } | { ok:false, reason }.
// El titular se deriva IGUAL que en el pipeline que compone la pieza
// (makeHeadline sobre la primera línea, ≤6 palabras ⇒ ≤8 de la regla).
// ---------------------------------------------------------------------------
function twinSourceCheck(post, opts) {
  const o = opts || {};
  const business = o.business || '';
  const caption = String((post && post.caption) || '');
  if (!caption.trim()) return { ok: false, reason: 'sin_caption' };
  // Anti-empalmes primero: la firma exacta del post 112 ("El De escéptica
  // a fan:…") frena la gemela aunque el resto del caption esté sano.
  if (captionOpenIsGarbled(caption, business)) {
    return { ok: false, reason: 'apertura_empalmada' };
  }
  const gate = captionPasses(caption, {
    business, dna: o.dna || null, ig_username: o.igUsername || '',
  });
  if (!gate.ok) return { ok: false, reason: 'caption_no_pasa_lint: ' + gate.reason };
  let headline = '';
  try { headline = clean(makeHeadline(caption.split('\n')[0], 6, 70, o.category || null), 90); } catch (e) {}
  if (headline && (captionOpenIsGarbled(headline, business) || headline.split(/\s+/).length > 8)) headline = '';
  if (!headline) {
    // Sin titular limpio desde el caption: línea corta derivada del tema
    // guardado del posteo (source_topic/intent), con el mismo lint.
    const topic = clean(post && (post.source_topic || post.intent), 90);
    if (topic && !captionOpenIsGarbled(topic, business)) {
      try { headline = clean(makeHeadline(topic, 6, 70, o.category || null), 90); } catch (e) { headline = ''; }
      if (headline && captionOpenIsGarbled(headline, business)) headline = '';
    }
  }
  if (!headline) return { ok: false, reason: 'sin_titular_limpio' };
  return { ok: true, headline };
}

// Contexto de lint de un usuario para la gemela: nombre, rubro, ADN e IG
// (las fuentes que la generación usa para captionPasses).
function twinContextFor(db, uid) {
  const out = { business: '', category: null, dna: null, igUsername: '' };
  try {
    const prof = db.prepare('SELECT business_name, category, ig_username FROM profiles WHERE user_id = ?').get(uid) || {};
    out.business = prof.business_name || '';
    out.category = prof.category || null;
    out.igUsername = prof.ig_username || '';
    const dr = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid);
    if (dr && dr.dna_json) { try { out.dna = JSON.parse(dr.dna_json); } catch (e) {} }
  } catch (e) {}
  return out;
}

// ---------------------------------------------------------------------------
// (v330) POSTY NO SE REPITE EN LA PIEZA — ¿la imagen fuente nació con el
// avatar del negocio como protagonista? El motor lo sabe y lo registra al
// generarla (image_meta.avatar_protagonist: concept-shot con la
// referencia del avatar viajando, CHARACTER LOCK). Si la fuente ya trae
// al avatar en grande, estamparle abajo el medallón con el MISMO avatar
// lo duplica y se ve barato (visto en las destacadas propias de Posty,
// cuyo avatar ES su logo y su protagonista). Para el resto de las piezas
// — foto de producto del cliente, logo gráfico distinto del sujeto, sin
// registro — el medallón va como siempre.
// ---------------------------------------------------------------------------
function sourceHasAvatarProtagonist(db, post) {
  try {
    if (!db || !post || !post.image_path) return false;
    const row = db.prepare('SELECT avatar_protagonist FROM image_meta WHERE media_path = ?')
      .get(String(post.image_path));
    return !!(row && Number(row.avatar_protagonist) === 1);
  } catch (e) { return false; }
}

// ---------------------------------------------------------------------------
// createTwinStory({ db, post, brand, mediaDir, postImageAbs, scheduleAt })
// La gemela completa (v231): chequea la fuente, y recién si pasa genera la
// historia (tipo repost) marcada source='twin' la hace el llamador.
// Devuelve { status:'created', id, path, headline, band }
//        | { status:'omitted', reason } — registrado en events con motivo.
// Lanza solo si el render falla (el llamador ya captura, como antes).
// ---------------------------------------------------------------------------
function createTwinStory({ db, post, brand, mediaDir, postImageAbs = null, scheduleAt = null }) {
  const uid = post.user_id;
  const chk = twinSourceCheck(post, twinContextFor(db, uid));
  if (!chk.ok) {
    try {
      db.prepare(`INSERT INTO events (user_id, name, props) VALUES (?, 'twin_story_omitted', ?)`)
        .run(uid, JSON.stringify({ post_id: post.id, reason: chk.reason }));
    } catch (e) { /* el registro nunca frena al scheduler */ }
    return { status: 'omitted', reason: chk.reason };
  }
  // (v330) Si la fuente ya tiene al avatar de protagonista, la gemela
  // sale SIN medallón (queda registrado en events, como las omisiones).
  const avatarProtagonist = sourceHasAvatarProtagonist(db, post);
  if (avatarProtagonist) {
    try {
      db.prepare(`INSERT INTO events (user_id, name, props) VALUES (?, 'twin_story_no_medallion', ?)`)
        .run(uid, JSON.stringify({ post_id: post.id, reason: 'fuente_con_avatar_protagonista' }));
    } catch (e) { /* el registro nunca frena al scheduler */ }
  }
  const out = generateStory({
    db, uid, type: 'repost',
    ctx: { postHeadline: chk.headline, postImageAbs, avatarProtagonist },
    brand, mediaDir, scheduleAt,
  });
  return { status: 'created', id: out.id, path: out.path, headline: chk.headline, band: out.band || null, medallion: !avatarProtagonist };
}

function daysUntil(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

// ---------------------------------------------------------------------------
// renderStoryPng({ headline, sub, business, bgHex, textHex, logoAbs, photoAbs, outDir })
// → '/media/xxx.png' (1080×1920). Lanza si PIL/python falla (no silencioso).
// ---------------------------------------------------------------------------
function renderStoryPng({ headline, sub, business, bgHex, textHex, logoAbs, photoAbs, outDir, band, meta }) {
  const out = path.join(outDir, `story-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`);
  const args = [BRAND_CARD_PY,
    '--mode', 'story', '--w', String(STORY_W), '--h', String(STORY_H),
    '--headline', clean(headline, 120),
    '--sub', clean(sub, 120),
    '--bg', String(bgHex || '#0A1E33'), '--text', String(textHex || '#FFFFFF'),
    '--business', clean(business, 48), '--out', out];
  // (v231) Banda del bloque de texto: las historias no llevan palabras en
  // el medio — 'auto' deja que el renderer elija la banda tranquila.
  if (band) args.push('--band', String(band));
  if (logoAbs && fs.existsSync(logoAbs)) args.push('--logo', logoAbs);
  if (photoAbs && fs.existsSync(photoAbs)) args.push('--photo', photoAbs);
  const stdout = execFileSync('python3', args, { timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  if (!fs.existsSync(out)) throw new Error('brand-card.py no generó la story');
  const m = /band=(top|bottom)/.exec(stdout || '');
  if (meta) meta.band = m ? m[1] : null;
  return '/media/' + path.basename(out);
}

// ---------------------------------------------------------------------------
// generateStory({ db, uid, type, ctx, brand, mediaDir, scheduleAt })
// brand: { business, bgHex, textHex, logoAbs }. Crea el post (draft o
// scheduled) con media_type='story'. Devuelve { id, path }.
// ---------------------------------------------------------------------------
function generateStory({ db, uid, type, ctx, brand, mediaDir, scheduleAt = null }) {
  if (!STORY_TYPES.includes(type)) throw new Error('tipo de story inválido: ' + type);
  const content = buildStoryContent(type, ctx);
  if (!content) throw new Error(`sin contenido para story '${type}' (faltan datos)`);
  const b = brand || {};
  let photoAbs = null;
  if (type === 'repost' && ctx && ctx.postImageAbs && fs.existsSync(ctx.postImageAbs)) photoAbs = ctx.postImageAbs;
  if (!photoAbs && type !== 'repost') {
    // Fondo con foto real del rubro (biblioteca curada) en vez de fondo
    // plano: la tarjeta de marca ya sabe componer foto + overlay + texto.
    try {
      const prof = db.prepare('SELECT category FROM profiles WHERE user_id = ?').get(uid);
      const { pickStockPhoto } = require('./stock');
      photoAbs = pickStockPhoto(prof && prof.category, `${uid}:${type}:${new Date().toISOString().slice(0, 10)}`);
    } catch (e) {}
  }
  // (v330) POSTY NO SE REPITE: en la gemela (repost), si la imagen fuente
  // ya trae al avatar del negocio como protagonista, NO se estampa el
  // medallón. La decisión llega de createTwinStory (ctx.avatarProtagonist)
  // o se resuelve acá por la ruta de la imagen fuente (vías directas:
  // /api/story-generate y dailyStories). Sin fuente avatar, el medallón
  // va como siempre; las demás historias (foto stock) no cambian.
  let suppressLogo = false;
  if (type === 'repost' && photoAbs) {
    if (ctx && typeof ctx.avatarProtagonist === 'boolean') {
      suppressLogo = ctx.avatarProtagonist;
    } else {
      try {
        const src = db.prepare('SELECT image_path FROM posts WHERE user_id = ? AND image_path = ? ORDER BY id DESC LIMIT 1')
          .get(uid, '/media/' + path.basename(photoAbs));
        suppressLogo = sourceHasAvatarProtagonist(db, src);
      } catch (e) {}
    }
    if (suppressLogo) console.log(`[twin] sin medallón: la fuente ya trae al avatar de protagonista (uid ${uid})`);
  }
  const meta = {};
  const mediaPath = renderStoryPng({
    headline: content.headline, sub: content.sub,
    business: b.business || '', bgHex: b.bgHex, textHex: b.textHex,
    logoAbs: suppressLogo ? null : (b.logoAbs || null), photoAbs, outDir: mediaDir, band: 'auto', meta,
  });
  const status = scheduleAt ? 'scheduled' : 'draft';
  const r = db.prepare(
    `INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, tipo)
     VALUES (?,?,?,?,?,?, 'story', 'story')`
  ).run(uid, mediaPath, content.headline, '', scheduleAt || null, status);
  return { id: Number(r.lastInsertRowid), path: mediaPath, band: meta.band || null, medallion: !suppressLogo };
}

// ---------------------------------------------------------------------------
// dailyStories(db, deps) — entrada del scheduler (1 vez/día).
// Genera hasta STORIES_PER_DAY historias programadas (13:00 y 19:00 AR)
// para usuarios con cupo de stories y contenido disponible.
// deps: { mediaDir, getBrand(uid)->brand, getCtx(uid)->ctx, nowHour }
// Nunca lanza: un usuario fallido no rompe el resto.
// ---------------------------------------------------------------------------
async function dailyStories(db, deps) {
  const { mediaDir, getBrand, getCtx } = deps || {};
  const out = { generated: 0, skipped: 0, errors: [] };
  if (!db || !mediaDir || typeof getBrand !== 'function' || typeof getCtx !== 'function') {
    out.errors.push('deps incompletas');
    return out;
  }
  let users = [];
  try {
    users = db.prepare(
      `SELECT DISTINCT p.user_id AS id FROM posts p
       JOIN settings s ON s.user_id = p.user_id
       JOIN users u ON u.id = p.user_id
       WHERE p.media_type = 'image' AND p.status IN ('published','scheduled')
         AND s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
         AND COALESCE(u.autopilot_enabled, 0) = 1`
    ).all();
    // Las historias diarias nacen PROGRAMADAS (se publican sin revisión):
    // eso ES piloto automático — solo para cuentas que lo activaron. Sin
    // esta puerta, cualquier cuenta conectada recibía historias solas
    // (así se posteaba sola la cuenta de @posty.hacetodo, 2026-10-16).
  } catch (e) { out.errors.push('users: ' + e.message); return out; }
  const today = new Date().toISOString().slice(0, 10);
  for (const u of users) {
    try {
      const uid = u.id;
      const nToday = db.prepare(
        `SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND media_type = 'story' AND date(created_at) = date(?)`
      ).get(uid, today).n || 0;
      if (nToday >= STORIES_PER_DAY) { out.skipped++; continue; }
      const brand = getBrand(uid) || {};
      const ctx = getCtx(uid) || {};
      // Orden: repost (si hay post del día con titular limpio) → poll/question alternados → countdown (si hay promo)
      const dayNum = Number(today.slice(8, 10));
      const types = [];
      if (ctx.postHeadline) types.push('repost');
      types.push(dayNum % 2 === 0 ? 'poll' : 'question');
      if (ctx.promoTitle && ctx.eventDate) types.push('countdown');
      const hours = ['13:00', '19:00'];
      for (const t of types.slice(0, STORIES_PER_DAY - nToday)) {
        try {
          const scheduleAt = `${today} ${hours[out.generated % hours.length]}:00`;
          generateStory({ db, uid, type: t, ctx, brand, mediaDir, scheduleAt });
          out.generated++;
        } catch (e) { /* sin contenido para este tipo: se prueba el siguiente */ }
      }
      if (!types.length) out.skipped++;
    } catch (e) {
      out.errors.push(`uid ${u.id}: ${e.message}`);
    }
  }
  return out;
}

module.exports = { STORY_TYPES, STORIES_PER_DAY, buildStoryContent, renderStoryPng, generateStory, dailyStories, daysUntil, twinSourceCheck, twinContextFor, createTwinStory, sourceHasAvatarProtagonist };
