// Harness de learning.js (NO va al zip). node test-learning.js
'use strict';
const { DatabaseSync } = require('node:sqlite');
const {
  initLearningTables, engagementRate, recordPerformance,
  getClientBoosts, getTopStyles, recordFromInsights, C_PRIOR, PRIOR_ER,
} = require('./learning');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : extra); }
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  initLearningTables(db);
  return db;
}
const good = { impressions: 1000, reach: 800, likes: 80, comments: 20, saved: 10 };
// ER bueno = (80 + 40 + 30)/800 = 150/800 = 0.1875

// --- 1. engagementRate ---
t('engagementRate fórmula', Math.abs(engagementRate(good) - 0.1875) < 1e-9, engagementRate(good));
t('engagementRate reach=0 no divide por cero', engagementRate({ likes: 5 }) === 5, engagementRate({ likes: 5 }));

// --- 2. Cold start → {} ---
{
  const db = freshDb();
  const b = getClientBoosts(db, 'u1');
  t('cold start boosts = {}', typeof b === 'object' && Object.keys(b).length === 0, b);
}

// --- 3. 3 posteos buenos → score sube y queda > prior ---
{
  const db = freshDb();
  const s1 = recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  const s2 = recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  const s3 = recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  t('score sube con cada post bueno', s3 > s2 && s2 > s1, { s1, s2, s3 });
  t('score > prior (0.03)', s3 > PRIOR_ER, s3);
  const row = db.prepare('SELECT posts_count FROM style_performance WHERE user_id = ? AND style_code = ?').get('u1', '/food');
  t('posts_count = 3', row.posts_count === 3, row);
  console.log(`   scores buenos: s1=${s1.toFixed(4)} s2=${s2.toFixed(4)} s3=${s3.toFixed(4)}`);
}

// --- 4. 1 post viral + prior → bayesiano NO se dispara (score < ER crudo) ---
{
  const db = freshDb();
  const viral = { reach: 1000, likes: 900, comments: 300, saved: 200 };
  const erCrudo = engagementRate(viral); // (900+600+600)/1000 = 2.1
  const s = recordPerformance(db, { userId: 'u1', styleCode: '/legoify', metrics: viral });
  t('ER crudo viral alto', erCrudo === 2.1, erCrudo);
  t('score viral < ER crudo (efecto bayesiano)', s < erCrudo, { s, erCrudo });
  t('score viral cercano al prior, no al máximo', s < 0.5, s);
  console.log(`   viral: ER crudo=${erCrudo} score bayesiano=${s.toFixed(4)}`);
}

// --- 5. Métricas malas repetidas → boost negativo ---
{
  const db = freshDb();
  // Otro usuario con buen rendimiento levanta el global del estilo
  for (let i = 0; i < 5; i++) recordPerformance(db, { userId: 'otro', styleCode: '/food', metrics: good });
  const bad = { reach: 1000, likes: 2, comments: 0, saved: 0 };
  for (let i = 0; i < 3; i++) recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: bad });
  const boosts = getClientBoosts(db, 'u1');
  t('boost negativo con métricas malas', boosts['/food'] < 0, boosts);
  t('boost acotado a >= -0.5', boosts['/food'] >= -0.5, boosts);
  console.log(`   boost malo: ${boosts['/food'].toFixed(4)}`);
}

// --- 6. posts_count=1 → no aparece en boosts ---
{
  const db = freshDb();
  recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  const boosts = getClientBoosts(db, 'u1');
  t('1 post no entra a boosts', !('/food' in boosts), boosts);
}

// --- 7. Global acumula para otro user_id ---
{
  const db = freshDb();
  recordPerformance(db, { userId: 'uA', styleCode: '/food', metrics: good });
  const g1 = db.prepare('SELECT posts_count, score FROM style_performance_global WHERE style_code = ?').get('/food');
  recordPerformance(db, { userId: 'uB', styleCode: '/food', metrics: good });
  const g2 = db.prepare('SELECT posts_count, score FROM style_performance_global WHERE style_code = ?').get('/food');
  t('global posts_count acumula (1→2)', g1.posts_count === 1 && g2.posts_count === 2, { g1, g2 });
  t('global score sube con datos buenos', g2.score > g1.score, { g1: g1.score, g2: g2.score });
  console.log(`   global: n=1 score=${g1.score.toFixed(4)} → n=2 score=${g2.score.toFixed(4)}`);
}

// --- 8. Inputs inválidos → error claro ---
{
  const db = freshDb();
  let e1 = '', e2 = '', e3 = '', e4 = '';
  try { recordPerformance(db, { userId: 'u1', metrics: good }); } catch (e) { e1 = e.message; }
  try { recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: { reach: 10, likes: -1 } }); } catch (e) { e2 = e.message; }
  try { recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: { reach: 'mucho' } }); } catch (e) { e3 = e.message; }
  try { recordPerformance(db, { metrics: good }); } catch (e) { e4 = e.message; }
  t('sin styleCode → error', /styleCode/.test(e1), e1);
  t('métrica negativa → error', /negativa/.test(e2), e2);
  t('métrica no numérica → error', /inválida/.test(e3), e3);
  t('sin userId → error', /userId/.test(e4), e4);
}

// --- 9. getTopStyles ---
{
  const db = freshDb();
  recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  recordPerformance(db, { userId: 'u1', styleCode: '/legoify', metrics: { reach: 1000, likes: 5 } });
  const top = getTopStyles(db, 'u1', 5);
  t('getTopStyles ordena por score desc', top.length === 2 && top[0].styleCode === '/food', top.map(r => r.styleCode));
  t('getTopStyles respeta limit', getTopStyles(db, 'u1', 1).length === 1);
}

// --- 10. recordFromInsights (wrapper con forma de getMediaMetrics) ---
{
  const db = freshDb();
  const s = recordFromInsights(db, {
    userId: 'u1', postId: 42, styleCode: '/food',
    metrics: { reach: 800, likes: 80, comments: 20, saved: 10 },
  });
  const row = db.prepare('SELECT posts_count, hook_id FROM style_performance WHERE user_id = ? AND style_code = ?').get('u1', '/food');
  t('recordFromInsights registra', row.posts_count === 1 && typeof s === 'number', { row, s });
  t('recordFromInsights traza postId en hook_id', row.hook_id === 'post:42', row.hook_id);
}

// --- 11. Idempotencia de init ---
{
  const db = freshDb();
  initLearningTables(db); // segunda llamada no rompe
  const s = recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  t('init idempotente', typeof s === 'number', s);
}

// --- 12. Boost positivo con rendimiento sobre el global ---
{
  const db = freshDb();
  for (let i = 0; i < 4; i++) recordPerformance(db, { userId: 'otro', styleCode: '/food', metrics: { reach: 1000, likes: 5 } });
  for (let i = 0; i < 3; i++) recordPerformance(db, { userId: 'u1', styleCode: '/food', metrics: good });
  const boosts = getClientBoosts(db, 'u1');
  t('boost positivo sobre el global', boosts['/food'] > 0, boosts);
  t('boost acotado a <= 1.0', boosts['/food'] <= 1.0, boosts);
  console.log(`   boost bueno: ${boosts['/food'].toFixed(4)}`);
}

console.log(`\nlearning.js: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
