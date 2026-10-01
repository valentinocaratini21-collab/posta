// learning.js — Posty aprende qué ESTILOS DE IMAGEN rinden para CADA cliente
// y prioriza lo que funciona. El cliente nunca lo ve como config: Posty
// "le pega cada vez más".
//
// Fórmula exacta (documentada aquí, no la cambies sin versionar):
//
//   ER (engagement rate) = (likes + 2*comments + 3*saved) / max(reach, 1)
//     Los comentarios pesan 2x y los guardados 3x porque son las señales
//     que más valora el algoritmo de Instagram.
//
//   Score bayesiano (por cliente y estilo):
//     score = (C * m + n * er) / (C + n)
//       C  = 5  (fuerza del prior: ~5 posteos "fantasma")
//       m  = SCORE GLOBAL del estilo (el prior colectivo, ya suavizado con
//            el prior 0.03), o 0.03 si todavía nadie midió ese estilo.
//            Se lee ANTES de sumar el posteo actual: el prior no incluye
//            la evidencia que se está agregando.
//       n  = posts_count acumulado del cliente para ese estilo
//       er = ER acumulado del cliente para ese estilo, calculado SOBRE LOS
//            TOTALES (likes_tot + 2*comments_tot + 3*saved_tot)/max(reach_tot,1),
//            equivalente a un promedio ponderado por reach.
//     Así 1 post con suerte viral NO domina: con n=1, score = (5m + er)/6,
//     siempre mucho más cerca del prior que del ER crudo. Y si el cliente
//     rinde peor que el global, su score queda debajo del global → boost
//     negativo (ver getClientBoosts).
//
//   Score global del estilo (para el prior de otros clientes):
//     score_global = (5 * 0.03 + n_g * er_g) / (5 + n_g)
//     con n_g/er_g acumulados de TODOS los clientes.
//
//   Boost por cliente (lo que consume pickStyle para reordenar):
//     boost = clamp((score_cliente - globalMean) / max(globalMean, 0.01), -0.5, 1.0)
//       globalMean = score global del estilo, o 0.03 si no hay datos.
//     Solo estilos con posts_count >= 2 (evita ruido de 1 solo post).
//     Cold start (sin filas del cliente): {} → pickStyle queda intacto.
//
// REGLA DURA: el boost SOLO reordena dentro del pool válido de pickStyle.
// JAMÁS habilita un estilo prohibido por brandSafe o NEVER_STYLES — eso lo
// garantiza pickStyle (image-styles.js), no este módulo. Este módulo solo
// devuelve números; no decide qué estilos son elegibles.
//
// Uso típico (el integrador lo cablea en scheduler.js):
//   initLearningTables(db);                                   // una vez
//   recordFromInsights(db, { userId, postId, styleCode, intent, hookId,
//     metrics: { reach, likes, comments, saved } });          // por post medido
//   const boosts = getClientBoosts(db, userId);               // para pickStyle
'use strict';

const C_PRIOR = 5;        // fuerza del prior bayesiano (~5 posteos "fantasma")
const PRIOR_ER = 0.03;    // ER por defecto cuando nadie midió el estilo (3%)
const MIN_POSTS = 2;      // posts_count mínimo para que un estilo entre a boosts

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Crea las tablas si no existen. Idempotente: se puede llamar en cada arranque.
function initLearningTables(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS style_performance (
  user_id TEXT,
  style_code TEXT,
  intent TEXT DEFAULT '',
  hook_id TEXT DEFAULT '',
  decision TEXT DEFAULT '',
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  score REAL DEFAULT 0,
  updated_at TEXT,
  PRIMARY KEY (user_id, style_code)
);
CREATE TABLE IF NOT EXISTS style_performance_global (
  style_code TEXT PRIMARY KEY,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  score REAL DEFAULT 0,
  updated_at TEXT
);
`);
  // Migración para DBs ya creadas sin la columna decision.
  try { db.exec(`ALTER TABLE style_performance ADD COLUMN decision TEXT DEFAULT ''`); } catch (e) { /* ya existe */ }
}

// ER = (likes + 2*comments + 3*saved) / max(reach, 1)
function engagementRate({ reach = 0, likes = 0, comments = 0, saved = 0 } = {}) {
  return (likes + 2 * comments + 3 * saved) / Math.max(reach, 1);
}

function _checkMetrics(metrics) {
  const m = metrics || {};
  const out = {};
  for (const k of ['impressions', 'reach', 'likes', 'comments', 'saved']) {
    const v = m[k] === undefined ? 0 : m[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`learning: métrica "${k}" inválida (tiene que ser número): ${JSON.stringify(m[k])}`);
    }
    if (v < 0) {
      throw new Error(`learning: métrica "${k}" negativa no permitida: ${v}`);
    }
    out[k] = v;
  }
  return out;
}

function _now() {
  return new Date().toISOString();
}

// Registra el rendimiento de un posteo para un estilo. UPSERT en la tabla del
// cliente y en la global. Devuelve el score bayesiano resultante del cliente.
function recordPerformance(db, { userId, styleCode, intent = '', hookId = '', metrics = {}, decision = '' }) {
  if (!userId && userId !== 0) {
    throw new Error('learning: userId es requerido');
  }
  if (!styleCode || typeof styleCode !== 'string' || !styleCode.trim()) {
    throw new Error('learning: styleCode es requerido (string no vacío)');
  }
  const dec = String(decision || '');
  if (dec && !['approved', 'auto', 'dismissed'].includes(dec)) {
    throw new Error(`learning: decision inválida: ${JSON.stringify(decision)}`);
  }
  const m = _checkMetrics(metrics);
  const code = styleCode.trim();

  // El prior m del cliente es el score global del estilo ANTES de este posteo
  // (si el cliente es el primero en medir el estilo, m = PRIOR_ER).
  // Usar el score global (suavizado) y no el ER crudo global evita que el
  // prior colapse a los propios datos del cliente y mantiene el boost
  // con el signo correcto cuando el cliente rinde peor/mejor que el resto.
  const gRow = db.prepare('SELECT score, reach, likes, comments, saved, posts_count FROM style_performance_global WHERE style_code = ?').get(code);
  const mPrior = (gRow && gRow.score !== null && gRow.score !== undefined) ? gRow.score : PRIOR_ER;

  // Fila del cliente (upsert acumulando)
  const uRow = db.prepare('SELECT reach, likes, comments, saved, impressions, posts_count FROM style_performance WHERE user_id = ? AND style_code = ?').get(String(userId), code);
  const uReach = (uRow ? uRow.reach : 0) + m.reach;
  const uLikes = (uRow ? uRow.likes : 0) + m.likes;
  const uComments = (uRow ? uRow.comments : 0) + m.comments;
  const uSaved = (uRow ? uRow.saved : 0) + m.saved;
  const uImpr = (uRow ? uRow.impressions : 0) + m.impressions;
  const uN = (uRow ? uRow.posts_count : 0) + 1;
  const uEr = engagementRate({ reach: uReach, likes: uLikes, comments: uComments, saved: uSaved });
  const uScore = (C_PRIOR * mPrior + uN * uEr) / (C_PRIOR + uN);

  db.prepare(`INSERT INTO style_performance
    (user_id, style_code, intent, hook_id, decision, impressions, reach, likes, comments, saved, posts_count, score, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, style_code) DO UPDATE SET
      intent = excluded.intent, hook_id = excluded.hook_id,
      decision = CASE WHEN excluded.decision != '' THEN excluded.decision ELSE decision END,
      impressions = excluded.impressions, reach = excluded.reach,
      likes = excluded.likes, comments = excluded.comments, saved = excluded.saved,
      posts_count = excluded.posts_count, score = excluded.score, updated_at = excluded.updated_at`)
    .run(String(userId), code, String(intent || ''), String(hookId || ''), dec,
      uImpr, uReach, uLikes, uComments, uSaved, uN, uScore, _now());

  // Fila global (upsert acumulando, prior propio = PRIOR_ER)
  const gReach = (gRow ? gRow.reach : 0) + m.reach;
  const gLikes = (gRow ? gRow.likes : 0) + m.likes;
  const gComments = (gRow ? gRow.comments : 0) + m.comments;
  const gSaved = (gRow ? gRow.saved : 0) + m.saved;
  const gImpr = (gRow ? gRow.impressions : 0) + m.impressions;
  const gN = (gRow ? gRow.posts_count : 0) + 1;
  const gEr = engagementRate({ reach: gReach, likes: gLikes, comments: gComments, saved: gSaved });
  const gScore = (C_PRIOR * PRIOR_ER + gN * gEr) / (C_PRIOR + gN);

  db.prepare(`INSERT INTO style_performance_global
    (style_code, impressions, reach, likes, comments, saved, posts_count, score, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(style_code) DO UPDATE SET
      impressions = excluded.impressions, reach = excluded.reach,
      likes = excluded.likes, comments = excluded.comments, saved = excluded.saved,
      posts_count = excluded.posts_count, score = excluded.score, updated_at = excluded.updated_at`)
    .run(code, gImpr, gReach, gLikes, gComments, gSaved, gN, gScore, _now());

  return uScore;
}

// Boosts por cliente para reordenar el pool de pickStyle.
// Cold start → {}. Solo estilos con posts_count >= 2.
function getClientBoosts(db, userId) {
  const rows = db.prepare(
    'SELECT style_code, score, posts_count FROM style_performance WHERE user_id = ? AND posts_count >= ?'
  ).all(String(userId), MIN_POSTS);
  if (!rows.length) return {};
  const gRows = db.prepare('SELECT style_code, score FROM style_performance_global').all();
  const gScoreByCode = {};
  for (const g of gRows) gScoreByCode[g.style_code] = g.score;
  const boosts = {};
  for (const r of rows) {
    const globalMean = (gScoreByCode[r.style_code] !== undefined && gScoreByCode[r.style_code] !== null)
      ? gScoreByCode[r.style_code]
      : PRIOR_ER;
    boosts[r.style_code] = clamp(
      (r.score - globalMean) / Math.max(globalMean, 0.01),
      -0.5, 1.0
    );
  }
  return boosts;
}

// Top estilos del cliente por score (para futuros reportes / cartas).
function getTopStyles(db, userId, limit = 5) {
  const rows = db.prepare(
    `SELECT style_code AS styleCode, intent, hook_id AS hookId, impressions, reach, likes,
            comments, saved, posts_count AS postsCount, score
     FROM style_performance WHERE user_id = ? ORDER BY score DESC LIMIT ?`
  ).all(String(userId), Math.max(1, Math.floor(limit) || 5));
  return rows;
}

// Wrapper con la forma que devuelve insights.js:getMediaMetrics
// ({ reach, likes, comments, saved }).
// El styleCode lo resuelve el integrador desde el registro del posteo
// (posts.style_code / concepto usado) ANTES de llamar.
// NOTA para el integrador (scheduler.js): la ingesta real la hace él —
// tiene que (1) resolver styleCode por post, (2) evitar doble conteo
// marcando qué postIds ya ingirió, y (3) llamar a esta función con las
// métricas frescas de insights. postId se guarda en intent/hookId solo
// como trazabilidad si el integrador lo pasa por hookId.
function recordFromInsights(db, { userId, postId, styleCode, intent = '', hookId = '', metrics = {} }) {
  if (postId !== undefined && postId !== null && String(postId).trim() !== '') {
    hookId = String(hookId || `post:${postId}`);
  }
  return recordPerformance(db, { userId, styleCode, intent, hookId, metrics });
}

module.exports = {
  initLearningTables,
  engagementRate,
  recordPerformance,
  getClientBoosts,
  getTopStyles,
  recordFromInsights,
  C_PRIOR,
  PRIOR_ER,
  MIN_POSTS,
};
