'use strict';
/* test-digest-scrub.js — Fix 2 (Juli, 2026-10-24): fundamento roto de
 * la cuenta 80. La cuenta (Gesty) nació con el ítem «Esta cuenta la
 * present» — un fragmento de prosa truncado a mitad de palabra — como
 * producto estrella, y contaminó su descripción («Ofrece: Esta cuenta
 * la present.») y 10 posteos. La puerta isPlausibleOfferItem ya
 * rechazaba ese ítem en las ingestas desde fuentes (web/catálogo/
 * bio/formulario), pero el circuito ADN⇄digest no la aplicaba:
 * buildFromParts tomaba las listas del ADN crudas, dnaFragmentFromDigest
 * devolvía los ítems sin filtrar y saveDigest persistía sin scrub.
 *
 * Este test prueba el corte en los tres puntos:
 *  1. buildFromParts: un ítem implausible del ADN no entra al digest
 *     (y el legítimo sí; la estrella no puede ser el corrupto).
 *  2. saveDigest/getStoredDigest: lo que se guarda sale depurado —
 *     un fundamento placeholder/truncado no llega a persistirse.
 *  3. dnaFragmentFromDigest: el fragmento digest→ADN no re-siembra el
 *     ítem corrupto y la estrella cae en el primer ítem plausible.
 * Corre con: node test-digest-scrub.js  (sin red, sqlite en memoria). */
const assert = require('assert');
const cd = require('./client-digest');

let passed = 0, failed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ×', name, '—', e.message); }
};
const names = (arr) => (arr || []).map((x) => String((x && (x.nombre || x.titulo || x.name)) || x || ''));
const CORRUPT = 'Esta cuenta la present';

console.log('== 0. La puerta misma (línea de base) ==');
ok('isPlausibleOfferItem rechaza el fragmento real de la cuenta 80', () => {
  assert.strictEqual(cd.isPlausibleOfferItem(CORRUPT), false);
  assert.strictEqual(cd.isPlausibleOfferItem('Facturación'), true);
});

console.log('== 1. buildFromParts: la ingesta de ADN pasa la puerta ==');
ok('el ítem corrupto del ADN no entra al digest; el legítimo sí', () => {
  const d = cd.buildFromParts({
    business: 'Gesty', category: 'servicios',
    dna: {
      productos: [CORRUPT, 'Facturación'],
      servicios: ['Presupuestos'],
      producto_estrella: CORRUPT,
      promos_activas: [CORRUPT],
    },
    web: null, feed: null, form: { description: '' },
  });
  assert.ok(d, 'buildFromParts devolvió un digest');
  const all = JSON.stringify(d);
  assert.ok(!all.includes(CORRUPT), `el digest contiene el ítem corrupto: ${all.slice(0, 300)}`);
  assert.ok(names(d.productos).includes('Facturación'), 'el ítem legítimo se conserva');
  assert.ok(names(d.servicios).includes('Presupuestos'), 'el servicio legítimo se conserva');
});

console.log('== 2. saveDigest: lo persistido sale depurado ==');
ok('roundtrip saveDigest→getStoredDigest sin el ítem corrupto y sin estrella corrupta', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const dirty = {
    business: 'Gesty', category: 'servicios',
    productos: [{ nombre: CORRUPT }, { nombre: 'Facturación' }],
    servicios: [{ nombre: 'Presupuestos' }, { nombre: CORRUPT }],
    promos: [{ titulo: CORRUPT }],
    inferred_star: { item: CORRUPT, confidence: 0.9 },
    fuentes: {}, question_candidates: [],
  };
  cd.saveDigest(db, 80, dirty);
  const stored = cd.getStoredDigest(db, 80);
  assert.ok(stored, 'el digest se guardó');
  assert.ok(!JSON.stringify(stored).includes(CORRUPT), 'lo guardado contiene el ítem corrupto');
  assert.ok(names(stored.productos).includes('Facturación'));
  assert.ok(names(stored.servicios).includes('Presupuestos'));
  assert.ok(!stored.inferred_star || stored.inferred_star.item !== CORRUPT, 'la estrella inferida corrupta no persiste');
  db.close();
});

console.log('== 3. dnaFragmentFromDigest: el fragmento no re-siembra el veneno ==');
ok('filtra las listas y la estrella cae en el primer ítem plausible', () => {
  const frag = cd.dnaFragmentFromDigest({
    productos: [{ nombre: CORRUPT }, { nombre: 'Facturación' }],
    servicios: [{ nombre: 'Presupuestos' }],
    promos: [{ titulo: CORRUPT }],
    inferred_star: { item: CORRUPT, confidence: 0.95 },
  });
  assert.ok(!JSON.stringify(frag).includes(CORRUPT), `el fragmento contiene el corrupto: ${JSON.stringify(frag)}`);
  assert.strictEqual(frag.producto_estrella, 'Facturación');
});

console.log('== 4. scrubDigestItems directo ==');
ok('scrubDigestItems limpia productos/servicios/promos e inferred_star', () => {
  assert.strictEqual(typeof cd.scrubDigestItems, 'function', 'scrubDigestItems está exportada');
  const d = cd.scrubDigestItems({
    productos: [CORRUPT, 'Facturación'],
    servicios: [{ nombre: CORRUPT }, { nombre: 'Agenda' }],
    promos: [{ titulo: CORRUPT }, { titulo: '2x1 en presupuestos' }],
    inferred_star: { item: CORRUPT, confidence: 0.9 },
  });
  assert.deepStrictEqual(d.productos, ['Facturación']);
  assert.deepStrictEqual(names(d.servicios), ['Agenda']);
  assert.deepStrictEqual(d.promos.map((p) => p.titulo), ['2x1 en presupuestos']);
  assert.strictEqual(d.inferred_star, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
