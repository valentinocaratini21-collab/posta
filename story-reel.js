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

// Reel ~16s: 4 escenas de 4s con ken burns (lo hace renderVideo).
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
  if (!nStories && !nReels) return { stories: 0, reels: 0, plan: plan.id };
  const feed = (feedDrafts || []).filter(d => d && d.image_path && localFile(mediaDir, d.image_path));
  if (!feed.length) {
    console.log(`[extras:${tag}] usuario ${uid}: sin imágenes de feed, no hay historias/reels`);
    return { stories: 0, reels: 0, plan: plan.id, reason: 'no_feed_images' };
  }
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, source_angle, tipo, strategy_why, week_key, needs_review) VALUES (?,?,?,?, 'draft',?,?,?,?,?,?,?)`);
  const rev = needsReview ? 1 : 0;
  let stories = 0, reels = 0;

  // Historias: round-robin sobre los posteos (cada historia usa otro posteo).
  for (let i = 0; i < nStories; i++) {
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

  // Reels: cada reel rota 4 imágenes distintas de la semana.
  for (let i = 0; i < nReels; i++) {
    try {
      const items = [];
      for (let k = 0; k < 4; k++) {
        const post = feed[(i * 2 + k) % feed.length];
        const f = localFile(mediaDir, post.image_path);
        if (f && !items.some(it => it.file === f)) items.push({ file: f, text: post.caption || post.source_topic || '' });
      }
      if (items.length < 2) { console.log(`[extras:${tag}] reel ${i + 1}: pocas imágenes, skip`); continue; }
      const out = await makeReelVideo({ items, mediaDir });
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
  return { stories, reels, plan: plan.id };
}

module.exports = { makeStoryImage, makeReelVideo, generateWeekExtras, STORY_HOUR };
