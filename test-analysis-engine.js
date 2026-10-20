'use strict';
/* test-analysis-engine.js — 🧠 Sistema de Análisis (2026-10-19)
 * La vara: SOLO datos verificables (ningún finding afirma un número sin
 * evidence), tono amable/profesional/alentador en TODA línea visible, el
 * porqué presente en cada forma de posteo, el plan de nacimiento sin
 * diagnóstico falso, el gateo por plan y el loop predicción→resultado.
 * Fixtures puros: cero red, cero IA. Corre con: node test-analysis-engine.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ae = require('./analysis-engine');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const NOW = Math.floor(Date.now() / 1000);
function mkPosts(specs) {
  // specs: [{daysAgo, type, caption}]
  return specs.map((s) => ({ taken_at: NOW - s.daysAgo * 86400, type: s.type || 'GraphImage', caption: s.caption || '' }));
}

// ---------- Fixture 1: cuenta existente con problemas reales ----------
const weakPosts = mkPosts([
  { daysAgo: 40, caption: 'Foto del local' },
  { daysAgo: 31, caption: 'Nuestro menú' },
  { daysAgo: 22, caption: 'Vení a conocernos' },
  { daysAgo: 15, caption: 'Plato del día' },
]);
const peers = [
  { handle: 'cafe.rival', followers: 1200, posts: mkPosts([{ daysAgo: 2, type: 'GraphVideo', caption: '¿Ya probaste nuestro latte?' }, { daysAgo: 4, type: 'GraphVideo', caption: 'Reservá tu mesa' }, { daysAgo: 6, caption: 'Mirá esto' }, { daysAgo: 9, type: 'GraphVideo', caption: 'Nuevo brunch' }, { daysAgo: 12, caption: 'Escribinos' }]) },
  { handle: 'bar.delaesquina', followers: 800, posts: mkPosts([{ daysAgo: 3, type: 'GraphVideo', caption: '¿Viste el 2x1?' }, { daysAgo: 7, caption: 'Foto' }, { daysAgo: 11, type: 'GraphVideo', caption: 'Agendá' }, { daysAgo: 15, caption: 'Plato' }]) },
  { handle: 'resto.nuevo', followers: 450, posts: mkPosts([{ daysAgo: 5, caption: 'Probá el menú' }, { daysAgo: 10, caption: 'Reservá' }, { daysAgo: 16, type: 'GraphVideo', caption: 'Mirá' }]) },
];
const a1 = ae.analyzeExisting({ profile: { followers: 320, posts_count: 40 }, posts: weakPosts, ctx: { postsPerWeek: 7, plan: 'pro', peers } });
ok(a1.kind === 'cuenta', 'F1: kind cuenta');
ok(a1.signals.posts_per_week != null && a1.signals.posts_per_week < 4, 'F1: ritmo bajo detectado (' + a1.signals.posts_per_week + '/sem)');
ok(a1.findings.some((f) => f.key === 'ritmo'), 'F1: finding de ritmo presente');
ok(a1.findings.some((f) => f.key === 'reels'), 'F1: finding de reels presente (0 videos)');
ok(a1.market.available === true, 'F1: mercado disponible con pares reales');
ok(a1.market.position && a1.market.position.total === 4, 'F1: posición en el rubro con 3 pares + propia');
ok(a1.predictions.length >= 2, 'F1: predicciones del loop presentes');

// CERO métricas fabricadas: todo finding con dígitos tiene evidence con valor.
let fab = 0;
const scan = (list) => (list || []).forEach((f) => { if (ae.findingViolatesEvidence(f)) fab++; });
scan(a1.findings); scan(a1.market.findings);
ok(fab === 0, 'F1: cero findings con números sin evidencia (' + fab + ' violaciones)');
// Y la guarda fail-closed descarta un finding fabricado a propósito:
const evil = { findings: [{ key: 'x', text: 'Tenés 9999 seguidores', now: '9999 hoy', evidence: null }], market: { findings: [] } };
const cleaned = ae.enforceEvidence(JSON.parse(JSON.stringify(evil)));
ok(cleaned.dropped.length === 1 && cleaned.analysis.findings.length === 0, 'F1: enforceEvidence descarta el finding fabricado');

// El porqué: presente en TODA forma de posteo.
const digest = { productos: [{ nombre: 'Medialunas de manteca' }], servicios: [{ nombre: 'Brunch completo' }], promos: [] };
const shapes = [
  { tipo: 'promo', formato: 'post', salesIntent: 'vender' },
  { tipo: 'novedad', formato: 'reel', salesIntent: 'autoridad' },
  { media_type: 'video', tipo: 'detras' },
  { tipo: 'tip' },
  {},
  { porque: 'porque el brunch es tu fuerte y este finde sale con todo' },
];
let whyCount = 0;
for (const s of shapes) {
  const post = { tipo: s.tipo || '', formato: s.formato || s.media_type || '', salesIntent: s.salesIntent || '', porque: s.porque || '' };
  const w = ae.whyForPost(post, a1, digest);
  if (w && w.length >= 20) whyCount++;
  else console.error('    sin porqué para', JSON.stringify(s));
}
ok(whyCount === shapes.length, 'F1: porqué presente en ' + whyCount + '/' + shapes.length + ' formas de posteo');
// El porqué de un reel se ata al hallazgo de reels (trazabilidad).
const whyReel = ae.whyForPost({ formato: 'reel' }, a1, digest);
ok(/reel/i.test(whyReel || ''), 'F1: el porqué del reel nombra el hallazgo de reels');
// Un porqué con número NO respaldado no pasa:
const whyEvil = ae.whyForPost({ porque: 'porque tenés 5000 seguidores nuevos por semana' }, a1, digest);
ok(!/5000/.test(whyEvil || ''), 'F1: porqué con número inventado es rechazado y cae a una línea honesta');

// Resumen de semana para Schedule.
const sum = ae.weekSummary(a1);
ok(sum && sum.split('\n').length >= 2 && /vi que/i.test(sum), 'F1: weekSummary "lo que vi → por qué tu semana es así"');

// ---------- Fixture 2: cuenta nueva (plan de nacimiento) ----------
const coldDigest = {
  productos: [{ nombre: 'Pan de masa madre' }, { nombre: 'Facturas de manteca' }],
  servicios: [], promos: [{ titulo: '2x1 en facturas', precio: '$3000' }],
  diferencial: 'Horno de barro propio', ciudad: 'Belgrano',
  inferred_star: { item: 'Pan de masa madre', confidence: 0.8 },
};
const a2 = ae.analyzeColdStart({ business: { name: 'Panadería Sol', category: 'panadería', city: 'Belgrano', ig_username: '' }, digest: coldDigest, peers, reviews: { rating: 4.8, total: 132 }, ctx: { postsPerWeek: 7, plan: 'trial' } });
ok(a2.kind === 'nacimiento', 'F2: kind nacimiento');
ok(a2.signals === null, 'F2: signals NULL — ningún número de feed inventado');
ok(a2.profile_kit && a2.profile_kit.bio.length > 0 && a2.profile_kit.bio.length <= 150, 'F2: kit con bio dentro del límite (' + (a2.profile_kit ? a2.profile_kit.bio.length : 0) + ' chars)');
ok(a2.profile_kit.bio.includes('Pan de masa madre'), 'F2: la bio nace del fundamento (su estrella)');
ok(a2.profile_kit.bio.includes('4,8'), 'F2: la bio usa su reputación real de Google');
ok(a2.profile_kit.highlights.includes('Promos'), 'F2: destacada Promos SOLO porque hay promo real');
ok(Array.isArray(a2.starter_grid) && a2.starter_grid.length === 9, 'F2: vidriera de exactamente 9 piezas');
ok(a2.starter_grid.every((s) => s.role && s.why), 'F2: cada pieza de la vidriera tiene rol y porqué');
ok(a2.findings.some((f) => f.key === 'nacimiento'), 'F2: finding de nacimiento presente');
ok(a2.findings.filter((f) => ae.hasDigits(f.text) || ae.hasDigits(f.now)).every((f) => f.evidence), 'F2: findings de plan con números solo con evidencia');
// Sin promos ni reseñas: las destacadas no se inventan.
const a2b = ae.analyzeColdStart({ business: { name: 'Taller Luz', category: 'servicios' }, digest: { productos: [], servicios: [{ nombre: 'Service completo' }] }, peers: [], reviews: null, ctx: {} });
ok(!a2b.profile_kit.highlights.includes('Promos') && !a2b.profile_kit.highlights.includes('Opiniones'), 'F2b: sin promo/reseñas reales, esas destacadas no existen');
ok(a2b.market.available === false && /sin-datos/.test(a2b.market.unavailable_reason || ''), 'F2b: mercado sin pares = sin-datos, jamás rellenado');

// ---------- Fixture 3: borde sin datos ----------
const a3 = ae.analyzeExisting({ profile: {}, posts: [], ctx: {} });
ok(a3.findings.length === 0, 'F3: cuenta sin posteos → cero findings (nada que afirmar)');
ok(a3.market.available === false, 'F3: mercado sin pares → no disponible');
ok(ae.isColdStart({ hasIg: true, profile: { posts_count: 0 }, posts: [] }) === true, 'F3: isColdStart detecta cuenta vacía');
ok(ae.isColdStart({ hasIg: false }) === true, 'F3: isColdStart detecta sin IG');
ok(ae.isColdStart({ hasIg: true, profile: { posts_count: 40 }, posts: weakPosts }) === false, 'F3: cuenta con historial NO es cold');

// ---------- Gateo por plan ----------
const gE = ae.gateForPlan(a1, 'esencial');
ok(gE.market_full === false && gE.market.locked === true && gE.market.findings.length === 0, 'G: Esencial ve el mercado bloqueado (probada, no error)');
ok(gE.market_teaser && gE.market_teaser.items.length >= 1, 'G: Esencial recibe la probada de mercado');
ok((gE.findings || []).length === a1.findings.length, 'G: la radiografía de SU cuenta es completa en todos los planes');
const gP = ae.gateForPlan(a1, 'pro');
ok(gP.market_full === true && gP.market.findings.length === a1.market.findings.length, 'G: Pro ve el mercado completo');
const gT = ae.gateForPlan(a1, 'trial');
ok(gT.market_full === false && !!gT.market_teaser, 'G: trial = cuenta completa + probada');

// ---------- El loop: predicción vs resultado ----------
const prior = { n: 1, created_at: '2026-10-12', signals: a1.signals, predictions: a1.predictions };
const betterPosts = mkPosts([
  { daysAgo: 1, type: 'GraphVideo', caption: '¿Probaste?' }, { daysAgo: 2, caption: 'Reservá' },
  { daysAgo: 3, type: 'GraphVideo', caption: 'Mirá' }, { daysAgo: 4, caption: 'Vení' },
  { daysAgo: 5, caption: 'Escribinos' }, { daysAgo: 6, type: 'GraphVideo', caption: '¿Viste?' },
  { daysAgo: 7, caption: 'Agendá tu turno' },
]);
const aNext = ae.analyzeExisting({ profile: { followers: 400 }, posts: betterPosts, ctx: { postsPerWeek: 7, prior } });
ok(aNext.loop && Array.isArray(aNext.loop.checks) && aNext.loop.checks.length >= 2, 'L: el análisis #2 contrasta las predicciones del #1');
ok(aNext.loop.checks.every((c) => ['cumplida', 'en-curso', 'sin-datos'].includes(c.status)), 'L: estados del loop válidos');
ok(aNext.loop.checks.find((c) => c.key === 'posts_per_week').status === 'cumplida', 'L: ritmo 7/sem = objetivo cumplido');
const loopNoData = ae.evaluateLoop(prior, {});
ok(loopNoData.checks.every((c) => c.status === 'sin-datos'), 'L: sin señales nuevas, todo queda sin-datos (nada se afirma)');

// ---------- Tono: TODA línea visible pasa el lint ----------
const visibleLines = [];
const collect = (a) => {
  (a.findings || []).forEach((f) => { visibleLines.push(f.text, f.with_posty, f.decision || ''); });
  (a.market && a.market.findings || []).forEach((f) => { visibleLines.push(f.text, f.with_posty, f.decision || ''); });
  if (a.profile_kit) visibleLines.push(a.profile_kit.bio, (a.profile_kit.bio_lines || []).join(' '));
  if (a.starter_grid) a.starter_grid.forEach((s) => visibleLines.push(s.why));
  const s = ae.weekSummary(a); if (s) visibleLines.push(s);
  shapes.forEach((sh) => { const w = ae.whyForPost({ tipo: sh.tipo || '', formato: sh.formato || '', salesIntent: sh.salesIntent || '', porque: sh.porque || '' }, a, digest); if (w) visibleLines.push(w); });
};
collect(a1); collect(a2); collect(a2b);
const badTone = visibleLines.filter((l) => l && !ae.lintTone(l).ok);
ok(badTone.length === 0, 'T: ' + visibleLines.length + ' líneas visibles, cero vocabulario de reto' + (badTone.length ? ' — ofensas: ' + JSON.stringify(badTone.slice(0, 2)) : ''));
ok(ae.lintTone('tu cuenta es un desastre total').ok === false, 'T: el lint sí caza el reto (control positivo)');

// ---------- Persistencia + historial (DB temporal, sin red) ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-analysis-'));
const db = new DatabaseSync(path.join(TMP, 't.db'));
db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)');
const s1 = ae.saveAnalysis(db, 42, a1);
ok(s1 && s1.n === 1, 'P: primer análisis persistido como #1');
const s2 = ae.saveAnalysis(db, 42, aNext);
ok(s2 && s2.n === 2, 'P: segundo análisis persistido como #2');
const latest = ae.latestAnalysis(db, 42);
ok(latest && latest.n === 2 && latest.prior && latest.prior.n === 1, 'P: latest trae el actual y la referencia al previo (el loop tiene memoria)');
const hist = ae.analysisHistory(db, 42, 6);
ok(hist.length === 2 && hist[0].loop_checks && hist[0].loop_checks.length >= 2, 'P: historial con los chequeos del loop');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

console.log(fails ? '\n✗ ' + fails + ' fallas' : '\n✓ TODO VERDE — test-analysis-engine');
process.exit(fails ? 1 : 0);
