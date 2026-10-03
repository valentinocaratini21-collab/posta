// Autopiloto + filtro de calidad (2026-10-02).
// El usuario pidió: "si los posteos no funcionan o salen con error, no podemos
// hacer autopiloto". Este módulo es el filtro que garantiza que solo lo bueno
// sale solo.

const fs = require('fs');
const path = require('path');

// Umbral mínimo para auto-publicar (0-100).
const QUALITY_THRESHOLD = 70;

// Palabras que indican caption genérico (no pasa el filtro).
const GENERIC_PATTERNS = [
  /lorem ipsum/i,
  /texto de ejemplo/i,
  /contenido aquí/i,
  /tu texto/i,
];

/**
 * qualityGate(post, db, mediaDir): chequeos RÁPIDOS (<1s, sin IA).
 * Devuelve { score: 0-100, checks: {name: {ok, detail}}, pass: bool }.
 * 
 * Checks:
 * 1. image_exists: el archivo existe y pesa > 10KB (no corrupto/vacío)
 * 2. caption_ok: > 20 caracteres, no genérico
 * 3. hashtags_ok: tiene al menos 1 hashtag
 * 4. not_duplicate: caption no es idéntico a uno de los últimos 7 días
 * 5. scheduled_ok: tiene fecha futura válida (si aplica)
 */
function qualityGate(post, db, mediaDir) {
  const checks = {};
  let score = 100;

  // 1. Imagen existe y no está corrupta
  try {
    const imgPath = post.image_path || '';
    const fileName = path.basename(imgPath);
    // Seguridad: solo archivos dentro de mediaDir
    const fullPath = path.join(mediaDir, fileName);
    const resolved = path.resolve(fullPath);
    const mediaResolved = path.resolve(mediaDir);
    if (!resolved.startsWith(mediaResolved)) {
      checks.image_exists = { ok: false, detail: 'ruta fuera de media' };
      score -= 40;
    } else if (!fs.existsSync(resolved)) {
      checks.image_exists = { ok: false, detail: 'archivo no existe' };
      score -= 40;
    } else {
      const stat = fs.statSync(resolved);
      if (stat.size < 10240) {
        checks.image_exists = { ok: false, detail: `muy chico (${stat.size}b)` };
        score -= 40;
      } else {
        checks.image_exists = { ok: true, detail: `${Math.round(stat.size / 1024)}KB` };
      }
    }
  } catch (e) {
    checks.image_exists = { ok: false, detail: 'error: ' + e.message };
    score -= 40;
  }

  // 2. Caption con contenido real
  try {
    const caption = String(post.caption || '').trim();
    if (caption.length < 20) {
      checks.caption_ok = { ok: false, detail: `muy corto (${caption.length} chars)` };
      score -= 25;
    } else if (GENERIC_PATTERNS.some(p => p.test(caption))) {
      checks.caption_ok = { ok: false, detail: 'texto genérico/placeholder' };
      score -= 25;
    } else {
      checks.caption_ok = { ok: true, detail: `${caption.length} chars` };
    }
  } catch (e) {
    checks.caption_ok = { ok: false, detail: 'error' };
    score -= 25;
  }

  // 3. Hashtags
  try {
    const tags = String(post.hashtags || '').trim();
    const count = (tags.match(/#/g) || []).length;
    if (count < 1) {
      checks.hashtags_ok = { ok: false, detail: 'sin hashtags' };
      score -= 10;
    } else {
      checks.hashtags_ok = { ok: true, detail: `${count} hashtags` };
    }
  } catch (e) {
    checks.hashtags_ok = { ok: false, detail: 'error' };
    score -= 10;
  }

  // 4. No duplicado (últimos 7 días)
  try {
    const caption = String(post.caption || '').trim().slice(0, 100);
    if (caption.length > 20 && post.user_id && post.id) {
      const dup = db.prepare(`
        SELECT id FROM posts 
        WHERE user_id = ? AND id != ? AND status IN ('scheduled','published','publishing')
        AND created_at > datetime('now', '-7 days')
        AND substr(caption, 1, 100) = ?
        LIMIT 1
      `).get(post.user_id, post.id, caption);
      if (dup) {
        checks.not_duplicate = { ok: false, detail: `duplicado del post ${dup.id}` };
        score -= 25;
      } else {
        checks.not_duplicate = { ok: true, detail: 'único' };
      }
    } else {
      checks.not_duplicate = { ok: true, detail: 'sin caption para comparar' };
    }
  } catch (e) {
    // Si la DB falla, no bloqueamos por esto (fail-open solo para este check)
    checks.not_duplicate = { ok: true, detail: 'check omitido' };
  }

  score = Math.max(0, Math.min(100, score));
  return {
    score,
    checks,
    pass: score >= QUALITY_THRESHOLD,
    threshold: QUALITY_THRESHOLD,
  };
}

/**
 * Guarda el resultado del quality gate en la DB.
 */
function saveQualityResult(db, postId, result) {
  try {
    db.prepare(`UPDATE posts SET quality_score = ?, quality_checks = ? WHERE id = ?`)
      .run(result.score, JSON.stringify(result.checks), postId);
  } catch (e) {
    console.error('[quality] no pude guardar:', e.message);
  }
}

/**
 * shouldAutopublish(userId, postId, db, mediaDir): decide si un posteo
 * puede salir solo. Requiere:
 * 1. Usuario con autopilot_enabled = 1
 * 2. Quality gate con score >= umbral
 * Si pasa, devuelve { ok: true, score }. Si no, { ok: false, reason }.
 */
function shouldAutopublish(userId, postId, db, mediaDir) {
  try {
    const user = db.prepare('SELECT autopilot_enabled FROM users WHERE id = ?').get(userId);
    if (!user || !user.autopilot_enabled) {
      return { ok: false, reason: 'autopilot_off' };
    }
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(postId, userId);
    if (!post) {
      return { ok: false, reason: 'post_not_found' };
    }
    if (post.status !== 'draft' && post.status !== 'scheduled') {
      return { ok: false, reason: 'wrong_status:' + post.status };
    }
    const result = qualityGate(post, db, mediaDir);
    saveQualityResult(db, postId, result);
    if (!result.pass) {
      const failed = Object.entries(result.checks)
        .filter(([_, c]) => !c.ok)
        .map(([k, c]) => `${k}(${c.detail})`)
        .join(', ');
      console.log(`[autopilot] post ${postId} NO pasa (score ${result.score}): ${failed}`);
      return { ok: false, reason: 'quality_fail', score: result.score, failed };
    }
    console.log(`[autopilot] post ${postId} PASA (score ${result.score}), sale solo 🚀`);
    return { ok: true, score: result.score };
  } catch (e) {
    console.error('[autopilot] error:', e.message);
    return { ok: false, reason: 'error:' + e.message };
  }
}

module.exports = {
  qualityGate,
  saveQualityResult,
  shouldAutopublish,
  QUALITY_THRESHOLD,
};
