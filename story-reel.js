// Historias y reels del autopilot — Posta
// Generación 100% server-side con ffmpeg local, sin APIs externas caras.
// - Historias: reusan las imágenes de los posteos de la semana → 1080×1920
//   con fondo difuminado, imagen centrada y caption como overlay abajo.
// - Reels: MP4 9:16 de ~16s con 4 escenas (ken burns + texto) vía video.js.
// Todo se crea como BORRADOR (needs_review como los posteos): nada se publica
// sin que el usuario lo apruebe en "Revisá tu semana". Cero sorpresas.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renderVideo, ffmpegAvailable, resolveFont } = require('./video');
const { getPlan, TRIAL_PLAN } = require('./config/plans');

const SW = 1080;
const SH = 1920;
const STORY_HOUR = 13; // las historias salen al mediodía

function runFfmpeg(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', ...args], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
        const msg = (lines.filter(l => !/^frame=/.test(l)).slice(-2).join(' · ') || err.message).slice(0, 250);
        return reject(new Error('ffmpeg: ' + msg));
      }
      resolve();
    });
  });
}

// Texto corto y limpio para overlays (una línea, sin cortar palabras).
function shortText(t, max) {
  const s = String(t || '').split('\n')[0].trim().replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  const c = s.slice(0, max);
  const i = c.lastIndexOf(' ');
  return (i > max * 0.4 ? c.slice(0, i) : c).trim() + '…';
}

// Parte el caption en hasta 2 líneas de ≤30 caracteres (drawtext no hace wrap).
// Sin emojis: la fuente del overlay no tiene glifos y saldrían cajitas.
function captionLines(t) {
  const noEmoji = String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '');
  const words = noEmoji.split('\n')[0].trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const lines = [];
  let cur = '', used = 0;
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 30) {
      if (cur) { lines.push(cur.trim()); used += cur.trim().split(' ').length; }
      cur = w;
      if (lines.length === 2) break;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur && lines.length < 2) { lines.push(cur.trim()); used += cur.trim().split(' ').length; }
  if (used < words.length && lines.length) lines[lines.length - 1] = (lines[lines.length - 1] + ' …').trim();
  return lines.slice(0, 2);
}

// Historia 1080×1920: la imagen del posteo centrada sobre un fondo difuminado
// de sí misma + el caption abajo con caja. Se ve como una historia real.
async function makeStoryImage({ srcFile, caption, outFile }) {
  if (!ffmpegAvailable()) throw new Error('ffmpeg no disponible');
  if (!fs.existsSync(srcFile)) throw new Error('no existe imagen fuente: ' + srcFile);
  const FONT = resolveFont();
  const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tmpDir = path.join(path.dirname(outFile), '.tmp-story-' + tag);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const lines = captionLines(caption);
    const dt = (txtFile, y) =>
      `drawtext=fontfile=${FONT}:textfile='${txtFile}':fontsize=54:fontcolor=white:` +
      `box=1:boxcolor=black@0.55:boxborderw=28:x=(w-text_w)/2:y=${y}`;
    const txtFiles = lines.map((ln, i) => {
      const f = path.join(tmpDir, `cap${i}.txt`);
      fs.writeFileSync(f, ln.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%'));
      return f;
    });
    const textVf = txtFiles.map((f, i) => dt(f, i === 0 ? (txtFiles.length === 1 ? 'h-330' : 'h-420') : 'h-330')).join(',');
    const vf =
      `scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},gblur=sigma=45[bg];` +
      `[0:v]scale=${SW}:-2[fg];` +
      `[bg][fg]overlay=(W-w)/2:(H-h)/2` +
      (textVf ? ',' + textVf : '');
    await runFfmpeg([
      '-i', srcFile,
      '-filter_complex', vf,
      '-frames:v', '1', '-q:v', '3',
      outFile,
    ]);
    return outFile;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Reel LEGADO (~16s: 4 escenas de 4s con ken burns, sin audio, caption
// volcado en una línea): queda SOLO como fallback del motor v2 (reel-engine)
// — si el motor nuevo falla en runtime, un reel mediocre es mejor que
// ninguno y el scheduler ni se entera. Auditoría Fase 0 en reel-engine.js.
async function makeReelVideo({ items, mediaDir }) {
  if (!ffmpegAvailable()) throw new Error('ffmpeg no disponible');
  const scenes = items.slice(0, 4).map((it) => ({
    file: it.file,
    duration: 4,
    text: shortText(it.text, 70),
  }));
  if (!scenes.length) throw new Error('sin escenas para el reel');
  const out = await renderVideo({ scenes, mediaDir });
  return out; // { file, url, duration }
}

// Primera línea "publicable" de un caption: sin hashtags ni emojis, con la
// primera letra en mayúscula. Es el gancho real del posteo (lo que la
// cuenta publica como apertura), no un título inventado.
function hookFromCaption(caption) {
  const first = String(caption || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const clean = first.replace(/#\S+/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  // Si la primera línea es un párrafo, el gancho es su primera oración: el
  // motor (fitText) necesita frases completas, no cortes a mitad de idea.
  if (clean.length > 64) {
    const s1 = (clean.split(/[.!?]\s+/)[0] || '').trim();
    if (s1.length >= 12 && s1.length < clean.length) return s1.charAt(0).toUpperCase() + s1.slice(1);
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
function beatFromCaption(caption, hook) {
  const lines = String(caption || '').split('\n').map(s => s.trim()).filter(Boolean);
  for (const ln of lines) {
    const clean = ln.replace(/#\S+/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
    if (clean && clean !== hook && clean.length >= 12) return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  const sentences = String(caption || '').split(/[.!?]\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences[1]) {
    const clean = sentences[1].replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
    if (clean) return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return '';
}

// Reel v2 (reel-engine): videos del álbum primero; fotos del posteo +
// álbum (+ stock del rubro si falta material). Devuelve null si no hay
// material suficiente (el llamador decide el fallback).
async function makeReelVideoPro({ db, uid, feedPosts, mediaDir, salt = 0, weekKey = '' }) {
  const { buildReelPro, moodForCategory } = require('./reel-engine');
  const { pickStockPhoto, stockRubroFor } = require('./stock');
  const profile = (() => { try { return db.prepare('SELECT business_name, category, ig_username FROM profiles WHERE user_id = ?').get(uid) || {}; } catch (e) { return {}; } })();
  let brandHex = '';
  try {
    const s = db.prepare('SELECT brand_colors FROM settings WHERE user_id = ?').get(uid);
    const m = String((s && s.brand_colors) || '').match(/#?[0-9a-fA-F]{6}/);
    if (m) brandHex = m[0].startsWith('#') ? m[0] : '#' + m[0];
  } catch (e) {}
  const albumFiles = (kind, limit) => {
    try {
      return db.prepare('SELECT file_path FROM assets WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?')
        .all(uid, kind, limit).map(r => localFile(mediaDir, r.file_path)).filter(Boolean);
    } catch (e) { return []; }
  };
  // (Gap 4, 2026-10-25) SELECCIÓN DE VIDEOS CON LA CLASIFICACIÓN QUE YA
  // SE GUARDA: antes se tomaban los 3 videos más recientes a ciegas.
  // Ahora cada video puntúa — el tag que la pieza necesita (tipo/tema/
  // ángulo del primer posteo del feed que ilustra este reel) manda,
  // cada issue de calidad medido resta, y la recencia desempata. El
  // orden de aparición lo sigue marcando la rotación por `salt`.
  const pickAlbumVideos = (limit) => {
    let rows = [];
    try {
      rows = db.prepare('SELECT file_path, album_tag, album_quality FROM assets WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 12')
        .all(uid, 'video');
    } catch (e) { rows = []; }
    const post0ref = (feedPosts || [])[0] || {};
    const blob = `${post0ref.tipo || ''} ${post0ref.source_topic || ''} ${post0ref.source_angle || ''}`.toLowerCase();
    const wants = [];
    if (/equip|team|staff|trabaj/.test(blob)) wants.push('equipo');
    if (/local|negocio|tienda|shop|store|vidriera|fachada/.test(blob)) wants.push('local');
    if (/product|plato|prenda|oferta|promo/.test(blob)) wants.push('producto');
    const ISSUES = ['oscura', 'movida', 'baja-res', 'cortada'];
    const scored = rows.map((r, idx) => {
      let score = 0;
      const wi = wants.indexOf(String(r.album_tag || ''));
      if (wi === 0) score += 100; else if (wi > 0) score += 40;
      score -= String(r.album_quality || '').split(',').map((s) => s.trim()).filter((t) => ISSUES.includes(t)).length * 30;
      score -= idx; // las filas ya vienen por recencia DESC: desempate suave
      return { f: localFile(mediaDir, r.file_path), score };
    }).filter((x) => x.f);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => x.f);
  };
  const videos = pickAlbumVideos(3);
  const albumPhotos = albumFiles('photo', 6);
  const feedPhotos = (feedPosts || []).map(p => localFile(mediaDir, p.image_path)).filter(Boolean);
  const photos = [...new Set([...feedPhotos, ...albumPhotos])];
  // Stock del rubro como relleno si el material propio no alcanza.
  if (photos.length + videos.length < 3 && profile.category) {
    for (let k = 0; k < 3 && photos.length + videos.length < 3; k++) {
      const sp = pickStockPhoto(profile.category, `${uid}-reel-${salt}-${k}`);
      if (sp && !photos.includes(sp)) photos.push(sp);
    }
  }
  if (photos.length + videos.length < 2) return null;
  // Rotación por índice de reel: que dos reels de la semana no salgan iguales.
  const rot = (arr, n) => arr.length > 1 ? arr.map((_, i) => arr[(i + n) % arr.length]) : arr;
  const post0 = (feedPosts || [])[salt % Math.max(1, (feedPosts || []).length)] || (feedPosts || [])[0] || {};
  const hook = hookFromCaption(post0.caption) || shortText(post0.source_topic || '', 50);
  const mid = beatFromCaption(post0.caption, hookFromCaption(post0.caption)) || shortText(post0.source_angle || '', 52);
  const handle = profile.ig_username ? '@' + String(profile.ig_username).replace(/^@/, '') : (profile.business_name || '');
  const mood = moodForCategory(profile.category, stockRubroFor(profile.category));
  const reelPhotos = rot(photos, salt * 2).slice(0, 5);
  const reelVideos = rot(videos, salt);

  // MOTION v3 (Fase 2, 2026-10-20 — spec-motion-v3.md; ACTIVADO POR
  // DEFECTO el 2026-10-21 por mandato de Valentino): el guion NACE del
  // fundamento (reel-script.js) y el motor renderiza subtítulos
  // cinéticos + xfade (reel-engine v3). Cualquier problema (sin
  // fundamento, IA caída, guion rechazado) cae al camino v2 de abajo
  // DECLARÁNDOLO en el log — nunca en silencio.
  // Apagado de emergencia: POSTY_REEL_SCRIPT=0 (vuelve al reel v2).
  if (process.env.POSTY_REEL_SCRIPT !== '0') {
    try {
      const clientDigest = require('./client-digest');
      const { buildReelScript } = require('./reel-script');
      const { planKineticCaptions, validateCaptionPlan } = require('./kinetic-captions');
      const digest = clientDigest.getDigest(db, uid);
      const script = await buildReelScript({
        digest, post: post0, durationSec: 15,
        intent: post0.sales_intent || post0.salesIntent || undefined,
        apiKey: process.env.OPENAI_API_KEY || '',
      });
      if (script && !script.degraded && script.source === 'ai') {
        const captionPlan = planKineticCaptions(script);
        const planCheck = validateCaptionPlan(captionPlan);
        if (planCheck.ok) {
          console.log(`[reel-script] usuario ${uid}: guion IA ok (${script.totalWords} palabras, intención ${script.intent}, plantilla ${script.intent})`);
          return buildReelPro({
            mediaDir, photos: reelPhotos, videos: reelVideos,
            script, captionPlan, template: script.intent,
            hook: script.hook, mid: `${script.problem} ${script.solution}`.trim(), cta: script.cta,
            handle, brandHex, mood,
            musicSeed: `${uid}:${weekKey}:${salt}`,
            // Pulido v3 (2026-10-20): el rubro elige el prompt de
            // efecto y los nombres reales del fundamento marcan la
            // palabra clave del gancho (énfasis en color de marca).
            rubro: profile.category || undefined,
            keywords: [...(digest.productos || []), ...(digest.servicios || [])].map(x => x && x.nombre).filter(Boolean),
          });
        }
        console.log(`[reel-script] usuario ${uid}: plan de subtítulos inválido (${planCheck.errors.join(',')}) — sigo con v2`);
      } else {
        console.log(`[reel-script] usuario ${uid}: guion degradado (${(script && script.degradeReason) || 'sin_guion'}) — sigo con v2`);
      }
    } catch (e) {
      console.error(`[reel-script] usuario ${uid}: falló la integración v3, sigo con v2:`, e.message);
    }
  }

  return buildReelPro({
    mediaDir,
    photos: reelPhotos,
    videos: reelVideos,
    // SIN shortText acá: el motor ajusta el tamaño de fuente para que la
    // frase entre COMPLETA (fitText); cortar antes dejaba ganchos a medias.
    hook: String(hook || '').slice(0, 90),
    mid: String(mid || '').slice(0, 90),
    cta: '¡Seguinos!',
    handle,
    brandHex,
    mood,
    musicSeed: `${uid}:${weekKey}:${salt}`,
  });
}

function localFile(mediaDir, imagePath) {
  if (!imagePath) return null;
  const f = path.join(mediaDir, path.basename(String(imagePath)));
  try { return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; } catch (e) { return null; }
}

// Entrada principal: genera historias + reels como borradores de la semana.
// feedDrafts: filas de posts ya creadas (media_type='image', status='draft').
// No toca el autopilot de feed: si algo falla acá, la semana sigue igual.
async function generateWeekExtras({ db, uid, weekKey, tag, mediaDir, feedDrafts, needsReview }) {
  const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(uid) || {};
  const plan = getPlan(u.plan_status === 'active' ? u.plan : TRIAL_PLAN);
  const nStories = Number(plan.storiesPerWeek) || 0;
  const nReels = Number(plan.reelsPerWeek) || 0;
  if (!nStories && !nReels) return { stories: 0, reels: 0, plan: plan.id, need: { stories: 0, reels: 0 }, have: { stories: 0, reels: 0 } };
  const feed = (feedDrafts || []).filter(d => d && d.image_path && localFile(mediaDir, d.image_path));
  if (!feed.length) {
    console.log(`[extras:${tag}] usuario ${uid}: sin imágenes de feed, no hay historias/reels`);
    return { stories: 0, reels: 0, plan: plan.id, reason: 'no_feed_images', need: { stories: nStories, reels: nReels }, have: { stories: 0, reels: 0 } };
  }
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, source_angle, tipo, strategy_why, week_key, needs_review) VALUES (?,?,?,?, 'draft',?,?,?,?,?,?,?)`);
  const rev = needsReview ? 1 : 0;
  let stories = 0, reels = 0;

  // IDEMPOTENCIA (2026-10-16): se genera SOLO el déficit. Antes esta
  // función insertaba siempre el cupo completo y por eso el pipeline solo
  // podía llamarla desde cero — una semana completada en dos tandas nunca
  // recibía las historias/reels que le faltaban.
  const have = { story: 0, video: 0 };
  try {
    for (const row of db.prepare(`SELECT media_type, COUNT(*) AS n FROM posts WHERE user_id = ? AND week_key = ? AND media_type IN ('story','video') AND status IN ('draft','scheduled','published') GROUP BY media_type`).all(uid, weekKey)) {
      if (row.media_type === 'story') have.story = row.n;
      if (row.media_type === 'video') have.video = row.n;
    }
  } catch (e) {}
  if (have.story >= nStories && have.video >= nReels) {
    console.log(`[extras:${tag}] usuario ${uid} semana ${weekKey}: extras ya completos (${have.story} historias, ${have.video} reels)`);
    return { stories: 0, reels: 0, plan: plan.id, already: true, need: { stories: nStories, reels: nReels }, have: { stories: have.story, reels: have.video } };
  }

  // Historias: round-robin sobre los posteos (cada historia usa otro posteo).
  for (let i = have.story; i < nStories; i++) {
    const post = feed[i % feed.length];
    try {
      const src = localFile(mediaDir, post.image_path);
      const name = `story-${uid}-${weekKey}-${i + 1}-${crypto.randomBytes(3).toString('hex')}.jpg`;
      const outFile = path.join(mediaDir, name);
      await makeStoryImage({ srcFile: src, caption: post.caption, outFile });
      ins.run(uid, `/media/${name}`, post.caption || '', post.hashtags || '', 'story',
        post.source_topic || '', post.source_angle || '', post.tipo || '',
        'Historia automática de la semana', weekKey, rev);
      stories++;
    } catch (e) {
      console.error(`[extras:${tag}] historia ${i + 1} falló:`, e.message);
    }
  }

  // Reels: motor v2 (reel-engine) primero — videos del álbum + fotos con
  // ritmo, textos por tiempos y música. Fallback al legado si el motor
  // nuevo falla o no hay material (POSTY_REELS_V2=0 lo apaga del todo).
  for (let i = have.video; i < nReels; i++) {
    try {
      const items = [];
      for (let k = 0; k < 4; k++) {
        const post = feed[(i * 2 + k) % feed.length];
        const f = localFile(mediaDir, post.image_path);
        if (f && !items.some(it => it.file === f)) items.push({ file: f, text: post.caption || post.source_topic || '' });
      }
      let out = null;
      if (process.env.POSTY_REELS_V2 !== '0') {
        try { out = await makeReelVideoPro({ db, uid, feedPosts: feed, mediaDir, salt: i, weekKey }); }
        catch (e) { console.error(`[extras:${tag}] reel v2 falló (sigo con el legado):`, e.message); }
      }
      if (!out) {
        if (items.length < 2) { console.log(`[extras:${tag}] reel ${i + 1}: pocas imágenes, skip`); continue; }
        out = await makeReelVideo({ items, mediaDir });
      }
      const post0 = feed[i % feed.length];
      ins.run(uid, out.url, post0.caption || '', post0.hashtags || '', 'video',
        post0.source_topic || '', post0.source_angle || '', post0.tipo || '',
        'Reel automático de la semana', weekKey, rev);
      reels++;
    } catch (e) {
      console.error(`[extras:${tag}] reel ${i + 1} falló:`, e.message);
    }
  }

  console.log(`[extras:${tag}] usuario ${uid} semana ${weekKey}: ${stories} historias + ${reels} reels`);
  return { stories, reels, plan: plan.id, need: { stories: nStories, reels: nReels }, have: { stories: have.story + stories, reels: have.video + reels } };
}

module.exports = { makeStoryImage, makeReelVideo, makeReelVideoPro, generateWeekExtras, STORY_HOUR };
