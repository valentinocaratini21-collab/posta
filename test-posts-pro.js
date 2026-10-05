// test-posts-pro.js — Harness de integración: reels + learning loop + hook engine.
// Uso: node test-posts-pro.js
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const reels = require('./reels');
const learning = require('./learning');
const hooks = require('./hooks');
const styles = require('./image-styles');
const gen = require('./generator');

let pass = 0, fail = 0;
const pending = [];
function t(name, fn) {
  pending.push((async () => {
    try { await fn(); pass++; }
    catch (e) { fail++; console.error('FAIL:', name, '→', e.message); }
  })());
}

// ---------- 1. Reels ----------
t('ffmpeg disponible en el servidor', () => {
  assert.strictEqual(reels.ffmpegAvailable(), true);
});

t('buildReel genera mp4 válido 1080×1920 sin audio + cover', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reeltest-'));
  const photos = [];
  for (let i = 0; i < 3; i++) {
    const p = path.join(dir, `f${i}.png`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=1080x1350:rate=1:duration=1`, '-frames:v', '1', p]);
    photos.push(p);
  }
  const r = await reels.buildReel({ photos, headline: 'Milanesas como en casa', brandHex: '#2793C8', businessName: 'Lo de Pepe', outDir: dir });
  assert.ok(fs.existsSync(r.path), 'mp4 existe');
  assert.ok(fs.existsSync(r.coverPath), 'cover existe');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', r.path]).toString());
  const vs = probe.streams.find(s => s.codec_type === 'video');
  assert.strictEqual(vs.width, 1080);
  assert.strictEqual(vs.height, 1920);
  assert.ok(!probe.streams.some(s => s.codec_type === 'audio'), 'sin audio');
  const dur = parseFloat(probe.format.duration);
  assert.ok(dur >= 13 && dur <= 17, `duración ${dur}s en rango`);
  assert.ok(r.audioNote && r.audioNote.length > 20, 'audioNote con sugerencia');
  assert.ok(fs.statSync(r.coverPath).size > 1000, 'cover con contenido');
  fs.rmSync(dir, { recursive: true, force: true });
});

t('buildReel sin fotos → error claro (no cuelga)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reeltest-'));
  await assert.rejects(() => reels.buildReel({ photos: [], outDir: dir }), /al menos 1 foto/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('reelsThisWeek cuenta tipo=reel en ventana de 7 días', () => {
  const { DatabaseSync } = require('node:sqlite');
  const mdb = new DatabaseSync(':memory:');
  mdb.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, tipo TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`);
  mdb.exec(`INSERT INTO posts (user_id, tipo, created_at) VALUES (1,'reel',datetime('now','-1 day')), (1,'reel',datetime('now','-8 days')), (1,'image',datetime('now')), (2,'reel',datetime('now'))`);
  assert.strictEqual(reels.reelsThisWeek(mdb, 1), 1);
  assert.strictEqual(reels.reelsThisWeek(mdb, 2), 1);
});

// ---------- 2. Learning loop + pickStyle ----------
t('learning: cold start → boosts vacío (pickStyle intacto)', () => {
  const { DatabaseSync } = require('node:sqlite');
  const mdb = new DatabaseSync(':memory:');
  learning.initLearningTables(mdb);
  assert.deepStrictEqual(learning.getClientBoosts(mdb, 999), {});
});

t('learning: boost reordena dentro del pool válido', () => {
  // Sin rubro el pool es la lista promo en orden: base = /popart (índice 0).
  const base = styles.pickStyle({ tipo: 'promo', rubro: '' });
  assert.strictEqual(base.style.code, '/popart');
  // Boost +1.0 al índice 1 (/neon): 100 - 120 = -20 < 0 → gana el favorito del cliente.
  const boosted = styles.pickStyle({ tipo: 'promo', rubro: '', boosts: { '/neon': 1.0 } });
  assert.strictEqual(boosted.style.code, '/neon', `boost lleva a /neon, dio ${boosted.style.code}`);
  // Sin boost, el ranking por intención manda.
  const plain = styles.pickStyle({ tipo: 'promo', rubro: '' });
  assert.strictEqual(plain.style.code, '/popart');
});

t('learning: boost NUNCA habilita estilo no-brandSafe ni prohibido', () => {
  // /legoify es fantasía (no brandSafe): con boost máximo en intent promo no puede salir
  const r = styles.pickStyle({ tipo: 'promo', rubro: 'gastronomia', boosts: { '/legoify': 1.0, '/popup': 1.0 } });
  assert.ok(r.style.brandSafe, 'el elegido es brandSafe aunque el boost apunte a fantasía');
  // NEVER_STYLES: profesionales + fantasía (salvo viral)
  const r2 = styles.pickStyle({ tipo: 'promo', rubro: 'profesionales', boosts: { '/legoify': 1.0 } });
  assert.ok(r2.style.brandSafe, 'NEVER_STYLES se respeta con boost');
});

t('learning: recordPerformance integra métricas y sube score', () => {
  const { DatabaseSync } = require('node:sqlite');
  const mdb = new DatabaseSync(':memory:');
  learning.initLearningTables(mdb);
  const s1 = learning.recordPerformance(mdb, { userId: 1, styleCode: '/food', intent: 'comida', hookId: 'h01', metrics: { reach: 1000, likes: 80, comments: 10, saved: 5 } });
  const s2 = learning.recordPerformance(mdb, { userId: 1, styleCode: '/food', intent: 'comida', hookId: 'h02', metrics: { reach: 2000, likes: 200, comments: 30, saved: 10 } });
  assert.ok(s2 > s1, `score sube con buenos metrics (${s1} → ${s2})`);
  const boosts = learning.getClientBoosts(mdb, 1);
  assert.ok(boosts['/food'] > 0, 'boost positivo para estilo rendidor');
});

// ---------- 3. Hook engine ----------
t('hooks: 50 fórmulas, ids únicos, ningún hook prohibido', () => {
  assert.strictEqual(hooks.HOOKS.length, 50);
  assert.strictEqual(new Set(hooks.HOOKS.map(h => h.id)).size, 50);
  for (const h of hooks.HOOKS) {
    assert.ok(!hooks.isBanned(h.formula), `fórmula baneada: ${h.id}`);
    assert.ok(!hooks.isBanned(h.ejemplo), `ejemplo baneado: ${h.id}`);
  }
});

t('hooks: pickHook no repite usedHookIds hasta agotar', () => {
  const ids = hooks.HOOKS.filter(h => h.intents.includes('promo')).map(h => h.id);
  const used = ids.slice(0, ids.length - 1);
  const h = hooks.pickHook({ intent: 'promo', usedHookIds: used });
  assert.ok(!used.includes(h.id), 'no devuelve un hook ya usado');
  const h2 = hooks.pickHook({ intent: 'promo', usedHookIds: ids });
  assert.strictEqual(h2.reused, true, 'al agotar marca reused');
});

t('hooks: applyPostyHook antepone hook y no duplica', () => {
  const out = gen.applyPostyHook(
    { caption: 'Te contamos todo sobre nuestras milanesas.\n\nVení a probarlas.' },
    { tipo: 'promo', topic: 'milanesas', business: 'Lo de Pepe', usedHookIds: [] }
  );
  assert.ok(out.hookId, 'asigna hookId');
  assert.ok(!hooks.isBanned(out.caption.split('\n')[0]), 'el hook no es un anti-patrón');
  const again = gen.applyPostyHook({ caption: out.caption }, { tipo: 'promo', topic: 'x', business: 'y', usedHookIds: [] });
  assert.strictEqual(again.caption, out.caption, 'idempotente: no duplica');
});

t('hooks: respeta caption que ya abre con hook legacy (no duplica)', () => {
  const cap = 'Che, mirá esto 👀\n\nTe contamos todo.';
  const out = gen.applyPostyHook({ caption: cap }, { tipo: 'promo', topic: 'x', business: 'y', usedHookIds: [] });
  assert.strictEqual(out.caption, cap, 'no toca el caption con hook legacy');
  assert.ok(!out.hookId, 'no asigna hook nuevo');
});

t('hooks: renderHook sin slots colgados', () => {
  const h = hooks.HOOKS[0];
  const r = hooks.renderHook(h, { tema: '', negocio: '' });
  assert.ok(!/{|}/.test(r), 'sin llaves colgadas');
  assert.ok(!/  /.test(r), 'sin dobles espacios');
});

(async () => {
  await Promise.all(pending);
  console.log(`\nposts-pro: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
