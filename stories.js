// stories.js — Historias automáticas de Posty.
//
// Genera stories 1080×1920 derivadas del contenido de la semana del cliente:
//   poll      → encuesta "esto o aquello" (A/B)
//   question  → pregunta abierta a la audiencia
//   countdown → promo/evento con fecha ("TERMINA EN X DÍAS")
//   repost    → "mirá el último post" (repost del post del día)
//
// Render: brand-card.py en modo story (paleta del cliente SIEMPRE, texto
// grande y legible, safe areas de IG). Se guardan como posts con
// media_type='story' — la publicación la hace el pipeline existente
// (processDuePosts → publishStory). Nada se publica sin el flujo normal.
//
// Exporta: { STORY_TYPES, buildStoryContent, renderStoryPng, generateStory, dailyStories }
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

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
//        promoTitle, eventDate (AAAA-MM-DD), postCaption }
// ---------------------------------------------------------------------------
function buildStoryContent(type, ctx) {
  const c = ctx || {};
  if (type === 'poll') {
    const a = clean(c.pollA, 40) || 'Medialunas';
    const b = clean(c.pollB, 40) || 'Tostadas';
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
    const cap = clean(c.postCaption, 90);
    if (!cap) return null; // sin post del día: no hay repost
    return { headline: 'MIRÁ EL ÚLTIMO POST', sub: cap };
  }
  return null;
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
function renderStoryPng({ headline, sub, business, bgHex, textHex, logoAbs, photoAbs, outDir }) {
  const out = path.join(outDir, `story-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`);
  const args = [BRAND_CARD_PY,
    '--mode', 'story', '--w', String(STORY_W), '--h', String(STORY_H),
    '--headline', clean(headline, 120),
    '--sub', clean(sub, 120),
    '--bg', String(bgHex || '#0A1E33'), '--text', String(textHex || '#FFFFFF'),
    '--business', clean(business, 48), '--out', out];
  if (logoAbs && fs.existsSync(logoAbs)) args.push('--logo', logoAbs);
  if (photoAbs && fs.existsSync(photoAbs)) args.push('--photo', photoAbs);
  execFileSync('python3', args, { timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (!fs.existsSync(out)) throw new Error('brand-card.py no generó la story');
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
  const mediaPath = renderStoryPng({
    headline: content.headline, sub: content.sub,
    business: b.business || '', bgHex: b.bgHex, textHex: b.textHex,
    logoAbs: b.logoAbs || null, photoAbs, outDir: mediaDir,
  });
  const status = scheduleAt ? 'scheduled' : 'draft';
  const r = db.prepare(
    `INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, tipo)
     VALUES (?,?,?,?,?,?, 'story', 'story')`
  ).run(uid, mediaPath, content.headline, '', scheduleAt || null, status);
  return { id: Number(r.lastInsertRowid), path: mediaPath };
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
       WHERE p.media_type = 'image' AND p.status IN ('published','scheduled')
         AND s.ig_user_id IS NOT NULL AND s.ig_user_id != ''`
    ).all();
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
      // Orden: repost (si hay post del día) → poll/question alternados → countdown (si hay promo)
      const dayNum = Number(today.slice(8, 10));
      const types = [];
      if (ctx.postCaption) types.push('repost');
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

module.exports = { STORY_TYPES, STORIES_PER_DAY, buildStoryContent, renderStoryPng, generateStory, dailyStories, daysUntil };
