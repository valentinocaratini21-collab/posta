'use strict';
/* test-regen-post.js — Palanca admin de regeneración por posteo (v227,
 * aprobada por Valentino 2026-10-18: "Construí la palanca y regenerá los 7").
 * Prueba el contrato sin red ni IA paga:
 *  1) el endpoint existe tras requireAdminToken y el helper corre el
 *     pipeline normal (generateContent con lint + conceptShot);
 *  2) guardas: publicado → 409, estado no regenerable → 409, programado →
 *     se desprograma primero y se declara;
 *  3) reemplazo 1-a-1 en el MISMO id: UPDATE conservando week_key/tipo,
 *     versión anterior a post_versions e imagen anterior a prev_image_path
 *     (ningún INSERT de post nuevo: el viejo no sobrevive duplicado y el
 *     neto de cupo no cambia);
 *  4) los 7 titulares dirigidos inaugurales respetan la regla dura de
 *     pieza: ≤6 palabras cada uno.
 * Corre con: node test-regen-post.js */
const assert = require('assert');
const fs = require('fs');

const srv = fs.readFileSync('server.js', 'utf8');
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

console.log('== 1) Endpoint y pipeline ==');
ok('endpoint POST /api/admin/regen-post tras requireAdminToken', () => {
  assert.ok(srv.includes("app.post('/api/admin/regen-post', requireAdminToken, express.json()"));
});
ok('helper regenDirectedDraft usa el pipeline normal de un posteo', () => {
  assert.ok(srv.includes('async function regenDirectedDraft('));
  assert.ok(srv.includes('generateContent(contentInputFor(uid, topic, tipo, 0), key)'));
  assert.ok(srv.includes('conceptShotGenerateQueued({'));
  assert.ok(srv.includes('costs.assertAiOk(uid)'), 'el kill-switch de gasto aplica');
});
ok('el titular de la pieza es el dirigido (makeHeadline sobre el título)', () => {
  assert.ok(srv.includes('makeHeadline(title, 6, 70, rubroOf(uid))'));
});

console.log('== 2) Guardas de estado ==');
ok('publicado → 409 con error claro, jamás se regenera', () => {
  assert.ok(srv.includes("if (post.status === 'published') return res.status(409)"));
  assert.ok(srv.includes("'posteo publicado: no se regenera'"));
});
ok('otro estado no regenerable → 409', () => {
  assert.ok(srv.includes("'estado no regenerable: ' + post.status"));
});
ok('programado → se desprograma primero y la respuesta lo declara', () => {
  assert.ok(srv.includes("UPDATE posts SET status = 'draft', scheduled_at = NULL WHERE id = ?"));
  assert.ok(srv.includes('unscheduled = true'));
  assert.ok(srv.includes('unscheduled, title, headline'));
});

console.log('== 3) Reemplazo 1-a-1 en el mismo id ==');
ok('UPDATE en el lugar (sin INSERT INTO posts en el helper)', () => {
  const start = srv.indexOf('async function regenDirectedDraft(');
  const end = srv.indexOf("app.get('/api/ideas'");
  const body = srv.slice(start, end);
  assert.ok(body.includes('UPDATE posts SET image_path = ?'), 'actualiza la misma fila');
  assert.ok(body.includes('WHERE id = ?'));
  assert.ok(!body.includes('INSERT INTO posts'), 'no crea un posteo nuevo: el viejo no se duplica');
});
ok('la versión anterior queda guardada (post_versions + prev_image_path)', () => {
  const start = srv.indexOf('async function regenDirectedDraft(');
  const body = srv.slice(start, srv.indexOf("app.get('/api/ideas'"));
  assert.ok(body.includes('INSERT INTO post_versions'));
  assert.ok(body.includes('prev_image_path = ?'));
});
ok('el resultado queda en borrador y sin fecha de salida', () => {
  const start = srv.indexOf('async function regenDirectedDraft(');
  const body = srv.slice(start, srv.indexOf("app.get('/api/ideas'"));
  assert.ok(body.includes("status = 'draft', scheduled_at = NULL"));
});

console.log('== 4) Los 7 titulares dirigidos: ≤6 palabras (regla dura) ==');
const TITLES = [
  '¿Tu Instagram está vendiendo?',
  'Ninguna fecha te agarra desprevenido',
  'El freno de mano es tuyo',
  'Tu bandeja, en cero',
  'Tu página, con WhatsApp directo',
  'Community manager completo, desde $1.330/día',
  'Tu mejor posteo, potenciado',
];
for (const t of TITLES) {
  ok(`"${t}"`, () => {
    const words = t.split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 6, `tiene ${words.length} palabras`);
  });
}

console.log(`\nOK — ${passed} checks de la palanca regen-post (v227)`);
