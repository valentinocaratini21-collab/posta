'use strict';
/* test-ideas-loop.js — Loop de ideas semanal (v218, aprobado 2026-10-18).
 * Sin señal no hay idea: este suite prueba el módulo puro ideas.js —
 *  1) parseo de competidores (máx 5, sin la cuenta propia, dedup);
 *  2) señales desde un snapshot de competidor (top por comentarios + hueco
 *     de formato que el cliente no hace) con evidencia medible;
 *  3) ganador propio y efeméride como señales;
 *  4) bloqueos por estado (descartada/hecha no se repiten por semanas);
 *  5) contrato de deploy: tablas, endpoints, bloque en Schedule, cron del
 *     lunes y BUILD_ID v218.
 * Corre con: node test-ideas-loop.js   (sin red, sin IA paga). */
const assert = require('assert');
const fs = require('fs');

const ideas = require('./ideas');

let passed = 0;
const ok = (name, fn) => { if (fn) fn(); passed++; console.log('  ✓', name); };

console.log('== 1) Competidores: parseo y normalización ==');
ok('separa por coma/espacio/punto y coma, baja a minúsculas, saca la propia', () => {
  const r = ideas.parseCompetitorHandles('@predis.ai, Hootsuite; @metricool\n@posty.hacetodo', 'posty.hacetodo');
  assert.deepStrictEqual(r, ['predis.ai', 'hootsuite', 'metricool']);
});
ok('dedup y tope de 5', () => {
  const r = ideas.parseCompetitorHandles('@a1 @a1 @b2 @c3 @d4 @e5 @f6', '');
  assert.deepStrictEqual(r, ['a1', 'b2', 'c3', 'd4', 'e5']);
});
ok('tokens inválidos afuera (muy cortos, guiones); el resto entra', () => {
  const r = ideas.parseCompetitorHandles('foo bar, @ok.handle, x, @@doble, con-guion', '');
  assert.deepStrictEqual(r, ['foo', 'bar', 'ok.handle', 'doble']);
});
ok('canonicalCompetitors con @ y coma', () => {
  assert.strictEqual(ideas.canonicalCompetitors(['predis.ai', 'hootsuite']), '@predis.ai, @hootsuite');
  assert.strictEqual(ideas.canonicalCompetitors([]), '');
});
ok('entrada vacía o nula → lista vacía', () => {
  assert.deepStrictEqual(ideas.parseCompetitorHandles('', 'x'), []);
  assert.deepStrictEqual(ideas.parseCompetitorHandles(null, null), []);
});

console.log('== 2) Señales de competencia ==');
// Snapshot con la forma REAL de ideas.snapshotFromAudit: posts completos y
// top = array de hasta 4 posteos ordenados por comentarios.
const post = (type, comments, caption_first, shortcode) => ({ type, comments, caption_first, taken_at: 1760000000, shortcode });
const snap = {
  handle: 'predis.ai', followers: 100000, posts_count: 500, category: '', signals: null,
  posts: [
    post('GraphVideo', 42, 'Antes y después de un feed en 30 segundos', 'TOP42'),
    post('GraphVideo', 12, 'Cómo armar un reel en 5 minutos', 'V12'),
    post('GraphVideo', 8, 'Errores que matan tu alcance', 'V8'),
    post('GraphSidecar', 9, 'Carrusel de errores comunes', 'C9'),
    post('GraphSidecar', 4, 'Checklist de publicación', 'C4'),
    post('GraphImage', 3, 'Tip rápido de diseño', 'I3'),
  ],
  top: [
    post('GraphVideo', 42, 'Antes y después de un feed en 30 segundos', 'TOP42'),
    post('GraphVideo', 12, 'Cómo armar un reel en 5 minutos', 'V12'),
    post('GraphSidecar', 9, 'Carrusel de errores comunes', 'C9'),
    post('GraphVideo', 8, 'Errores que matan tu alcance', 'V8'),
  ],
};
ok('top del competidor: evidencia con @ y comentarios, angle con shortcode', () => {
  const out = ideas.buildIdeaSignals({ competitors: [snap], ownFormats30: { image: 2, video: 1, carousel: 1 }, ownWinner: null, ephemeris: [] });
  const top = out.find((s) => s.source === 'competitor');
  assert.ok(top, 'debería haber señal de competidor');
  assert.ok(top.evidence.includes('@predis.ai'));
  assert.ok(top.evidence.includes('42'));
  assert.strictEqual(top.angle_key, 'comp_top:predis.ai:TOP42');
  assert.strictEqual(top.format, 'reel');
});
ok('hueco de formato: el competidor vive de reels y el cliente no hizo ninguno', () => {
  const out = ideas.buildIdeaSignals({ competitors: [snap], ownFormats30: { image: 3, video: 0, carousel: 1 }, ownWinner: null, ephemeris: [] });
  const gap = out.find((s) => s.angle_key === 'comp_fmt:video:predis.ai');
  assert.ok(gap, 'debería detectar el hueco de video');
  assert.strictEqual(gap.format, 'reel');
  assert.ok(gap.evidence.includes('no publicaste'));
});
ok('sin hueco si el cliente ya publica ese formato', () => {
  const out = ideas.buildIdeaSignals({ competitors: [snap], ownFormats30: { image: 0, video: 2, carousel: 1 }, ownWinner: null, ephemeris: [] });
  assert.ok(!out.find((s) => s.angle_key.startsWith('comp_fmt:')));
});
ok('competidor sin interacción visible no genera señal de top', () => {
  const quiet = { handle: 'cuentaquieta', posts: [post('GraphImage', 1, 'Hola', 'Q1'), post('GraphImage', 0, 'Chau', 'Q2')],
    top: [post('GraphImage', 1, 'Hola', 'Q1')] };
  const out = ideas.buildIdeaSignals({ competitors: [quiet], ownFormats30: { image: 1, video: 0, carousel: 0 }, ownWinner: null, ephemeris: [] });
  assert.ok(!out.length, 'sin comentarios no hay ángulo que copiar');
});
ok('snapshotFromAudit arma el snapshot liviano desde la auditoría', () => {
  const data = { ok: true, profile: { handle: 'x.y', followers: 10, posts_count: 3, category: 'belleza' },
    posts: [{ type: 'GraphVideo', comments: 7, taken_at: 100, caption: 'Primera línea\nresto', shortcode: 'ABC123' }] };
  const s = ideas.snapshotFromAudit(data, { total: 1 });
  assert.strictEqual(s.handle, 'x.y');
  assert.strictEqual(s.posts[0].comments, 7);
  assert.strictEqual(s.posts[0].caption_first, 'Primera línea');
  assert.strictEqual(s.posts[0].shortcode, 'ABC123');
  assert.strictEqual(s.top[0].shortcode, 'ABC123');
  assert.strictEqual(ideas.snapshotFromAudit({ ok: false }, null), null);
});

console.log('== 3) Ganador propio y calendario ==');
ok('ganador propio con score suficiente genera señal con su evidencia', () => {
  const out = ideas.buildIdeaSignals({ competitors: [], ownFormats30: {}, ownWinner: { id: 55, caption_first: 'Promo de fin de mes', likes: 20, comments: 5, media_type: 'image', tipo: 'promo' }, ephemeris: [] });
  const w = out.find((s) => s.source === 'winner');
  assert.ok(w);
  assert.strictEqual(w.angle_key, 'winner:55');
  assert.ok(w.evidence.includes('20 ❤️') && w.evidence.includes('5 💬'));
});
ok('ganador flojo (score < 4) no genera señal', () => {
  const out = ideas.buildIdeaSignals({ competitors: [], ownFormats30: {}, ownWinner: { id: 56, caption_first: 'x', likes: 1, comments: 0 }, ephemeris: [] });
  assert.ok(!out.length);
});
ok('efeméride genera señal con nombre y fecha', () => {
  const out = ideas.buildIdeaSignals({ competitors: [], ownFormats30: {}, ownWinner: null, ephemeris: [{ name: 'Día de la Madre', date: '2026-10-18', daysLeft: 0, emoji: '💐', angle: 'el día de los regalos' }] });
  const e = out.find((s) => s.source === 'calendar');
  assert.ok(e);
  assert.ok(e.evidence.includes('Día de la Madre'));
  assert.ok(e.angle_key.startsWith('eph:2026-10-18:'));
});
ok('cero señales → cero candidatos (silencio, no relleno)', () => {
  const out = ideas.buildIdeaSignals({ competitors: [], ownFormats30: {}, ownWinner: null, ephemeris: [] });
  assert.deepStrictEqual(out, []);
});

console.log('== 4) Bloqueos: lo descartado/hecho no se repite ==');
ok('descartada reciente bloquea; hecha vieja libera', () => {
  const now = Date.now();
  const recent = new Date(now - 5 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const old = new Date(now - 50 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const b = ideas.blockedAngleKeys([
    { angle_key: 'comp_fmt:video:x', status: 'dismissed', created_at: recent },
    { angle_key: 'winner:9', status: 'made', created_at: old },
  ], now);
  assert.ok(b.has('comp_fmt:video:x'));
  assert.ok(!b.has('winner:9'));
});
ok('pendiente reciente también bloquea (no duplicar la misma semana)', () => {
  const now = Date.now();
  const recent = new Date(now - 2 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const b = ideas.blockedAngleKeys([{ angle_key: 'eph:2026-10-18:x', status: 'pending', created_at: recent }], now);
  assert.ok(b.has('eph:2026-10-18:x'));
});

console.log('== 5) Contrato de deploy ==');
const dbSrc = fs.readFileSync('db.js', 'utf8');
const srvSrc = fs.readFileSync('server.js', 'utf8');
const appSrc = fs.readFileSync('public/app.js', 'utf8');
const schSrc = fs.readFileSync('scheduler.js', 'utf8');
ok('tablas posty_ideas y competitor_snapshots en db.js', () => {
  assert.ok(dbSrc.includes('CREATE TABLE IF NOT EXISTS posty_ideas'));
  assert.ok(dbSrc.includes('CREATE TABLE IF NOT EXISTS competitor_snapshots'));
});
ok('server.js: loop, endpoints y admin', () => {
  for (const needle of ['runWeeklyIdeasLoop', 'runIdeasForUser', 'makeIdeaDraft', "app.get('/api/ideas'", "app.post('/api/ideas/:id/make'", "app.post('/api/ideas/:id/dismiss'", "app.post('/api/ideas/competitors'", "app.post('/api/admin/ideas/run'", "app.post('/api/admin/ideas/make'", 'ideas: weekIdeas']) {
    assert.ok(srvSrc.includes(needle), 'falta: ' + needle);
  }
  assert.ok(srvSrc.includes("const BUILD_ID = '20261018-v218'"));
});
ok('app.js: bloque de ideas en Schedule + enhanceIdeas', () => {
  assert.ok((appSrc.match(/id="hs-ideas"/g) || []).length >= 2, 'slot en las dos vistas de Schedule');
  assert.ok(appSrc.includes('async function enhanceIdeas'));
  assert.ok(appSrc.includes('Ideas de Posty para vos'));
  assert.ok(appSrc.includes('data-idea-make'));
});
ok('scheduler.js: cron lunes 07:00 BA con require perezoso', () => {
  assert.ok(schSrc.includes("'0 7 * * 1'"));
  assert.ok(schSrc.includes('runWeeklyIdeasLoop'));
});

console.log(`\n✅ test-ideas-loop: ${passed} checks OK`);
