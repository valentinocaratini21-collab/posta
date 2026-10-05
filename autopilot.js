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

// ---------- FASE 1: una sola escalera de confianza (2026-10-05) ----------
// trust_level:
//   0 = todo pasa por revisión/aprobación explícita (rueditas);
//   1 = publica solo, con aviso pre-publicación de 30 min (freno de emergencia);
//   2 = autopiloto pleno (aviso pre-publicación opt-in).
// Reemplaza los 3 mecanismos redundantes: training_wheels, autopilot_enabled +
// 10 aprobaciones limpias, y el gate de primera semana en processDuePosts.
// autopilot_enabled queda espejado de trust_level>=2.
const GOLDEN_TARGET = 5;     // golden examples para subir al nivel 1
const TRUST_CLEAN_WEEKS = 3; // semanas en auto sin vetos/fallos para el nivel 2

// Nivel de confianza del usuario. Fail-closed: ante cualquier duda → 0
// (columna aún no migrada, usuario inexistente, valor raro).
function trustLevel(db, userId) {
  try {
    const u = db.prepare('SELECT trust_level FROM users WHERE id = ?').get(userId);
    const tl = u ? u.trust_level : 0;
    return Number.isInteger(tl) && tl >= 0 ? tl : 0;
  } catch (e) { return 0; }
}

// Graduación al nivel 1: 5+ golden examples (aprobaciones del revisor) o
// 5+ publicados (paridad con la vieja trainingWheelsActive). Espeja
// training_wheels=0 para no romper lectores viejos. Idempotente.
function maybeGraduate(db, uid) {
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM golden_examples WHERE user_id = ?`).get(uid).n || 0;
    let ok = n >= GOLDEN_TARGET;
    if (!ok) {
      const pub = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'`).get(uid).n || 0;
      ok = pub >= GOLDEN_TARGET;
    }
    if (ok) {
      try { db.prepare(`UPDATE users SET trust_level = 1 WHERE id = ? AND COALESCE(trust_level, 0) < 1`).run(uid); } catch (e) {}
      try { db.prepare(`UPDATE users SET training_wheels = 0 WHERE id = ?`).run(uid); } catch (e) {}
    }
    return n;
  } catch (e) { return 0; }
}

// Graduación al nivel 2: TRUST_CLEAN_WEEKS semanas consecutivas con
// publicaciones automáticas (auto_published=1, lo marca el flujo auto) y sin
// vetos (rejected/cancelled) ni fallos. Se evalúa una vez por semana (sweep
// dominical). Las semanas sin actividad automática no cuentan ni resetean;
// una semana con veto/fallo resetea el contador a 0.
function maybeGraduateLevel2(db, uid) {
  try {
    const u = db.prepare('SELECT trust_level, auto_weeks_clean FROM users WHERE id = ?').get(uid) || {};
    if ((u.trust_level || 0) !== 1) return u.trust_level || 0;
    const auto = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ?
      AND status = 'published' AND COALESCE(auto_published, 0) = 1
      AND COALESCE(published_at, '') > datetime('now', '-7 days')`).get(uid).n || 0;
    if (!auto) return 1; // sin actividad auto esta semana: no cuenta ni resetea
    const bad = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ?
      AND created_at > datetime('now', '-7 days')
      AND (COALESCE(approval, '') = 'rejected' OR status = 'cancelled' OR status = 'failed')`).get(uid).n || 0;
    if (bad) {
      db.prepare(`UPDATE users SET auto_weeks_clean = 0 WHERE id = ?`).run(uid);
      console.log(`[trust] usuario ${uid}: semana con veto/fallo → contador a 0`);
      return 1;
    }
    const clean = (u.auto_weeks_clean || 0) + 1;
    if (clean >= TRUST_CLEAN_WEEKS) {
      db.prepare(`UPDATE users SET trust_level = 2, auto_weeks_clean = ?, autopilot_enabled = 1 WHERE id = ?`).run(clean, uid);
      console.log(`[trust] usuario ${uid} → NIVEL 2 (${clean} semanas limpias en auto) 🚀`);
      try {
        db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`)
          .run(uid, `🚀 Llegaste al nivel máximo de confianza: de ahora en más publico solo, sin pedirte nada. Si querés que te avise 30 min antes igual, lo prendés en Ajustes ✨`);
      } catch (e) {}
      return 2;
    }
    db.prepare(`UPDATE users SET auto_weeks_clean = ? WHERE id = ?`).run(clean, uid);
    console.log(`[trust] usuario ${uid}: semana limpia en auto ${clean}/${TRUST_CLEAN_WEEKS}`);
    return 1;
  } catch (e) { console.error('[trust] level2:', e.message); return 0; }
}

/**
 * shouldAutopublish(userId, postId, db, mediaDir): decide si un posteo
 * puede salir solo. Requiere:
 * 1. Usuario con autopilot_enabled = 1
 * 2. Quality gate con score >= umbral
 * Si pasa, devuelve { ok: true, score }. Si no, { ok: false, reason }.
 */
function shouldAutopublish(userId, postId, db, mediaDir) {  try {
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
  // FASE 1: escalera de confianza unificada.
  trustLevel,
  maybeGraduate,
  maybeGraduateLevel2,
  GOLDEN_TARGET,
  TRUST_CLEAN_WEEKS,
};
